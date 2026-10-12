import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { PaymentMethod } from "@/lib/types";

// Party/item balances are always computed at read time from Sale/Purchase
// rows rather than stored, so they can never drift out of sync.

// Applies as much of a party's currently-available advance credit as
// possible against their OWN other outstanding bills of the same type,
// oldest date first — so credit built up on one bill (e.g. an overpayment,
// or a standalone advance payment) immediately reduces what's owed on
// bills that already existed, not just a bill created after the fact. Must
// run inside the same transaction that just created/changed the advance,
// so it sees that change plus anything already sitting unapplied.
export async function sweepAdvanceIntoOutstandingSales(
  tx: Prisma.TransactionClient,
  partyId: string,
  // The payment method of the advance that triggered this sweep — recorded
  // on each ADVANCE SalePayment created here so it doesn't silently fall
  // back to the schema's CASH default and mislabel non-Cash advances on the
  // dashboard/reports. Defaults to CASH for resyncAdvanceForParty, where the
  // pool can be funded by several PartyPayments of different methods and
  // isn't attributed per-source-payment (see that function's comment).
  paymentMethod: PaymentMethod = "CASH",
  // Shown on each ADVANCE SalePayment this creates — callers that just
  // caused a specific overpayment pass something more useful than the
  // generic default (see POST .../sales/[id]/payments), so a bill that gets
  // settled this way says where the money actually came from. Only exact
  // for the credit created in the same request; if this sweep also spends
  // older unrelated leftover credit in the same pass, that older portion
  // gets labeled with this note too even though it doesn't apply to it.
  reasonNote = "Settled from advance credit"
) {
  const [receivedTotal, paidTotal, advanceSourcedTotal] = await Promise.all([
    tx.partyPayment.aggregate({
      where: { partyId, direction: "RECEIVED" },
      _sum: { amountCents: true },
    }),
    tx.partyPayment.aggregate({
      where: { partyId, direction: "PAID" },
      _sum: { amountCents: true },
    }),
    tx.salePayment.aggregate({
      where: { source: "ADVANCE", sale: { partyId } },
      _sum: { amountCents: true },
    }),
  ]);
  let available = Math.max(
    0,
    (receivedTotal._sum.amountCents ?? 0) -
      (paidTotal._sum.amountCents ?? 0) -
      (advanceSourcedTotal._sum.amountCents ?? 0)
  );
  if (available <= 0) return;

  const sales = await tx.sale.findMany({
    where: { partyId },
    orderBy: { date: "asc" },
    select: { id: true, totalCents: true, paidCents: true },
  });
  for (const sale of sales) {
    if (available <= 0) break;
    const dueCents = sale.totalCents - sale.paidCents;
    if (dueCents <= 0) continue;
    const applyCents = Math.min(available, dueCents);
    await tx.salePayment.create({
      data: {
        saleId: sale.id,
        date: new Date(),
        amountCents: applyCents,
        paymentMethod,
        source: "ADVANCE",
        notes: reasonNote,
      },
    });
    await tx.sale.update({
      where: { id: sale.id },
      data: { paidCents: sale.paidCents + applyCents },
    });
    available -= applyCents;
  }
}

// Mirror of sweepAdvanceIntoOutstandingSales for the Purchase side.
export async function sweepAdvanceIntoOutstandingPurchases(
  tx: Prisma.TransactionClient,
  partyId: string,
  // See the matching parameter on sweepAdvanceIntoOutstandingSales above.
  paymentMethod: PaymentMethod = "CASH",
  reasonNote = "Settled from advance credit"
) {
  const [paidTotal, receivedTotal, advanceSourcedTotal] = await Promise.all([
    tx.partyPayment.aggregate({
      where: { partyId, direction: "PAID" },
      _sum: { amountCents: true },
    }),
    tx.partyPayment.aggregate({
      where: { partyId, direction: "RECEIVED" },
      _sum: { amountCents: true },
    }),
    tx.purchasePayment.aggregate({
      where: { source: "ADVANCE", purchase: { partyId } },
      _sum: { amountCents: true },
    }),
  ]);
  let available = Math.max(
    0,
    (paidTotal._sum.amountCents ?? 0) -
      (receivedTotal._sum.amountCents ?? 0) -
      (advanceSourcedTotal._sum.amountCents ?? 0)
  );
  if (available <= 0) return;

  const purchases = await tx.purchase.findMany({
    where: { partyId },
    orderBy: { date: "asc" },
    select: { id: true, totalCents: true, paidCents: true },
  });
  for (const purchase of purchases) {
    if (available <= 0) break;
    const dueCents = purchase.totalCents - purchase.paidCents;
    if (dueCents <= 0) continue;
    const applyCents = Math.min(available, dueCents);
    await tx.purchasePayment.create({
      data: {
        purchaseId: purchase.id,
        date: new Date(),
        amountCents: applyCents,
        paymentMethod,
        source: "ADVANCE",
        notes: reasonNote,
      },
    });
    await tx.purchase.update({
      where: { id: purchase.id },
      data: { paidCents: purchase.paidCents + applyCents },
    });
    available -= applyCents;
  }
}

// Clears out any ADVANCE-sourced Sale/Purchase payments for a party and
// recomputes those bills' paidCents from their remaining payments, then
// re-runs the sweep so it reapplies whatever advance is actually available
// now. Needed whenever a PartyPayment — the sole funding source of the
// advance pool — is deleted or changed, since sweepAdvanceIntoOutstandingSales
// / Purchases only ever adds new ADVANCE applications and never removes stale
// ones left behind by a payment that shrank or no longer exists. The pool
// isn't attributed per-source-payment, so a precise partial unwind isn't
// possible — clearing and re-deriving from the party's current PartyPayment
// totals is the only way to keep bill balances correct.
export async function resyncAdvanceForParty(tx: Prisma.TransactionClient, partyId: string) {
  const advancedSales = await tx.salePayment.findMany({
    where: { source: "ADVANCE", sale: { partyId } },
    select: { id: true, saleId: true },
  });
  if (advancedSales.length > 0) {
    await tx.salePayment.deleteMany({
      where: { id: { in: advancedSales.map((p) => p.id) } },
    });
    for (const saleId of new Set(advancedSales.map((p) => p.saleId))) {
      const total = await tx.salePayment.aggregate({
        where: { saleId },
        _sum: { amountCents: true },
      });
      await tx.sale.update({
        where: { id: saleId },
        data: { paidCents: total._sum.amountCents ?? 0 },
      });
    }
  }

  const advancedPurchases = await tx.purchasePayment.findMany({
    where: { source: "ADVANCE", purchase: { partyId } },
    select: { id: true, purchaseId: true },
  });
  if (advancedPurchases.length > 0) {
    await tx.purchasePayment.deleteMany({
      where: { id: { in: advancedPurchases.map((p) => p.id) } },
    });
    for (const purchaseId of new Set(advancedPurchases.map((p) => p.purchaseId))) {
      const total = await tx.purchasePayment.aggregate({
        where: { purchaseId },
        _sum: { amountCents: true },
      });
      await tx.purchase.update({
        where: { id: purchaseId },
        data: { paidCents: total._sum.amountCents ?? 0 },
      });
    }
  }

  await sweepAdvanceIntoOutstandingSales(tx, partyId);
  await sweepAdvanceIntoOutstandingPurchases(tx, partyId);
}

// SalePayments settled against a party's existing advance credit (source:
// "ADVANCE") rather than fresh cash — see PartyPayment and SalePayment.source.
// Grouped by party via the parent Sale, since SalePayment has no partyId of
// its own.
async function getAdvanceSourcedOnSalesMap() {
  const rows = await db.salePayment.findMany({
    where: { source: "ADVANCE" },
    select: { amountCents: true, sale: { select: { partyId: true } } },
  });
  const map = new Map<string, number>();
  for (const row of rows) {
    const partyId = row.sale.partyId;
    if (!partyId) continue;
    map.set(partyId, (map.get(partyId) ?? 0) + row.amountCents);
  }
  return map;
}

// Mirrors getAdvanceSourcedOnSalesMap but for the "we prepaid this supplier"
// pool (PartyPayment PAID) settled against Purchases instead.
async function getAdvanceSourcedOnPurchasesMap() {
  const rows = await db.purchasePayment.findMany({
    where: { source: "ADVANCE" },
    select: { amountCents: true, purchase: { select: { partyId: true } } },
  });
  const map = new Map<string, number>();
  for (const row of rows) {
    const partyId = row.purchase.partyId;
    if (!partyId) continue;
    map.set(partyId, (map.get(partyId) ?? 0) + row.amountCents);
  }
  return map;
}

export async function getPartyBalanceMap() {
  const [
    saleTotals,
    purchaseTotals,
    receivedTotals,
    paidTotals,
    advanceSourcedOnSales,
    advanceSourcedOnPurchases,
  ] = await Promise.all([
      db.sale.groupBy({
        by: ["partyId"],
        where: { partyId: { not: null } },
        _sum: { totalCents: true, paidCents: true },
      }),
      db.purchase.groupBy({
        by: ["partyId"],
        where: { partyId: { not: null } },
        _sum: { totalCents: true, paidCents: true },
      }),
      // Advance payments outside of any Sale/Purchase (see PartyPayment) feed
      // into the same balance: receiving money from a party reduces what they
      // owe us, paying them money increases it (mirrors how Sale/Purchase
      // paidCents moves the balance below).
      db.partyPayment.groupBy({
        by: ["partyId"],
        where: { direction: "RECEIVED" },
        _sum: { amountCents: true },
      }),
      db.partyPayment.groupBy({
        by: ["partyId"],
        where: { direction: "PAID" },
        _sum: { amountCents: true },
      }),
      getAdvanceSourcedOnSalesMap(),
      getAdvanceSourcedOnPurchasesMap(),
    ]);

  const dueByParty = new Map<string, number>();
  for (const row of saleTotals) {
    if (!row.partyId) continue;
    const due = (row._sum.totalCents ?? 0) - (row._sum.paidCents ?? 0);
    dueByParty.set(row.partyId, (dueByParty.get(row.partyId) ?? 0) + due);
  }
  for (const row of purchaseTotals) {
    if (!row.partyId) continue;
    const due = (row._sum.totalCents ?? 0) - (row._sum.paidCents ?? 0);
    dueByParty.set(row.partyId, (dueByParty.get(row.partyId) ?? 0) - due);
  }
  for (const row of receivedTotals) {
    dueByParty.set(
      row.partyId,
      (dueByParty.get(row.partyId) ?? 0) - (row._sum.amountCents ?? 0)
    );
  }
  for (const row of paidTotals) {
    dueByParty.set(
      row.partyId,
      (dueByParty.get(row.partyId) ?? 0) + (row._sum.amountCents ?? 0)
    );
  }
  // A Sale's paidCents already includes any ADVANCE-sourced payments (so the
  // bill itself shows as paid), which independently nudges the line above
  // toward positive. Add the same amount back here to cancel that out —
  // otherwise the advance would count as both "still available" and "used".
  for (const [partyId, amount] of advanceSourcedOnSales) {
    dueByParty.set(partyId, (dueByParty.get(partyId) ?? 0) + amount);
  }
  // Mirror image for Purchases: a Purchase's paidCents already includes any
  // ADVANCE-sourced payments, which independently nudges the line above
  // toward positive too (via paidTotals above) — subtract the same amount
  // back out here to cancel that double-count.
  for (const [partyId, amount] of advanceSourcedOnPurchases) {
    dueByParty.set(partyId, (dueByParty.get(partyId) ?? 0) - amount);
  }
  return dueByParty;
}

// How much of a party's RECEIVED advance is still unapplied — i.e. hasn't
// already been used to settle a Sale (see SalePayment.source) or paid back
// out. Used to offer "apply advance to this bill" when recording a new sale.
export async function getAvailableAdvanceForSalesMap() {
  const [receivedTotals, paidTotals, advanceSourcedOnSales] = await Promise.all([
    db.partyPayment.groupBy({
      by: ["partyId"],
      where: { direction: "RECEIVED" },
      _sum: { amountCents: true },
    }),
    db.partyPayment.groupBy({
      by: ["partyId"],
      where: { direction: "PAID" },
      _sum: { amountCents: true },
    }),
    getAdvanceSourcedOnSalesMap(),
  ]);

  const map = new Map<string, number>();
  for (const row of receivedTotals) {
    map.set(row.partyId, (map.get(row.partyId) ?? 0) + (row._sum.amountCents ?? 0));
  }
  for (const row of paidTotals) {
    map.set(row.partyId, (map.get(row.partyId) ?? 0) - (row._sum.amountCents ?? 0));
  }
  for (const [partyId, amount] of advanceSourcedOnSales) {
    map.set(partyId, (map.get(partyId) ?? 0) - amount);
  }
  for (const [partyId, amount] of map) {
    map.set(partyId, Math.max(0, amount));
  }
  return map;
}

// Mirror of getAvailableAdvanceForSalesMap for the other direction: how much
// of a party's PAID advance (money we already gave them, e.g. prepaying a
// supplier) is still unapplied — used to offer "apply advance to this bill"
// when recording a new purchase. A party's net advance position can only
// ever favor one direction at a time (this and getAvailableAdvanceForSalesMap
// are mirror images of the same RECEIVED/PAID totals), so at most one of the
// two returns a positive amount for any given party.
export async function getAvailableAdvanceForPurchasesMap() {
  const [receivedTotals, paidTotals, advanceSourcedOnPurchases] = await Promise.all([
    db.partyPayment.groupBy({
      by: ["partyId"],
      where: { direction: "RECEIVED" },
      _sum: { amountCents: true },
    }),
    db.partyPayment.groupBy({
      by: ["partyId"],
      where: { direction: "PAID" },
      _sum: { amountCents: true },
    }),
    getAdvanceSourcedOnPurchasesMap(),
  ]);

  const map = new Map<string, number>();
  for (const row of paidTotals) {
    map.set(row.partyId, (map.get(row.partyId) ?? 0) + (row._sum.amountCents ?? 0));
  }
  for (const row of receivedTotals) {
    map.set(row.partyId, (map.get(row.partyId) ?? 0) - (row._sum.amountCents ?? 0));
  }
  for (const [partyId, amount] of advanceSourcedOnPurchases) {
    map.set(partyId, (map.get(partyId) ?? 0) - amount);
  }
  for (const [partyId, amount] of map) {
    map.set(partyId, Math.max(0, amount));
  }
  return map;
}

// Earliest unpaid Sale/Purchase date per party — used to flag a
// receivable/payable as overdue (outstanding for more than ~a month) on the
// dashboard. Prisma can't filter "totalCents > paidCents" in a `where`
// clause (that compares two columns), so this fetches the minimal fields
// and filters in JS — fine at small-business data volumes.
function oldestUnpaidFromRows(
  rows: { partyId: string | null; date: Date; totalCents: number; paidCents: number }[]
) {
  const oldestByParty = new Map<string, Date>();
  for (const row of rows) {
    if (!row.partyId || row.paidCents >= row.totalCents) continue;
    if (!oldestByParty.has(row.partyId)) oldestByParty.set(row.partyId, row.date);
  }
  return oldestByParty;
}

export async function getOldestUnpaidSaleDateByParty() {
  const rows = await db.sale.findMany({
    where: { partyId: { not: null } },
    select: { partyId: true, date: true, totalCents: true, paidCents: true },
    orderBy: { date: "asc" },
  });
  return oldestUnpaidFromRows(rows);
}

export async function getOldestUnpaidPurchaseDateByParty() {
  const rows = await db.purchase.findMany({
    where: { partyId: { not: null } },
    select: { partyId: true, date: true, totalCents: true, paidCents: true },
    orderBy: { date: "asc" },
  });
  return oldestUnpaidFromRows(rows);
}

export async function getItemStockMap() {
  const [saleQty, purchaseQty, adjustQty] = await Promise.all([
    db.saleItem.groupBy({ by: ["itemId"], _sum: { quantity: true } }),
    db.purchaseItem.groupBy({ by: ["itemId"], _sum: { quantity: true } }),
    // Manual corrections (physical count, losses…) — signed quantities.
    db.stockAdjustment.groupBy({ by: ["itemId"], _sum: { quantity: true } }),
  ]);

  const deltaByItem = new Map<string, number>();
  for (const row of purchaseQty) {
    deltaByItem.set(row.itemId, (deltaByItem.get(row.itemId) ?? 0) + (row._sum.quantity ?? 0));
  }
  for (const row of saleQty) {
    deltaByItem.set(row.itemId, (deltaByItem.get(row.itemId) ?? 0) - (row._sum.quantity ?? 0));
  }
  for (const row of adjustQty) {
    deltaByItem.set(row.itemId, (deltaByItem.get(row.itemId) ?? 0) + (row._sum.quantity ?? 0));
  }
  return deltaByItem;
}

// Items don't store a purchase price — it varies purchase to purchase — so
// this is the cost basis profit reports use instead: total value purchased
// divided by total quantity purchased, i.e. a running weighted average
// across every PurchaseItem recorded for that item to date.
export async function getItemAverageCostMap() {
  const rows = await db.purchaseItem.groupBy({
    by: ["itemId"],
    _sum: { quantity: true, lineTotalCents: true },
  });
  const map = new Map<string, number>();
  for (const row of rows) {
    const qty = row._sum.quantity ?? 0;
    const total = row._sum.lineTotalCents ?? 0;
    if (qty > 0) map.set(row.itemId, Math.round(total / qty));
  }
  return map;
}

// Available balance per account = opening balance + money in − money out.
// Only real money movement counts:
//   in:  sale payments with fresh money (source CASH), advances received
//        (incl. the excess part of an overpaid bill, stored as a RECEIVED
//        PartyPayment), and any INCOME transaction
//   out: purchase payments with fresh money, advances paid, expenses
// ADVANCE-sourced bill payments just apply credit already counted when the
// advance came in, so they're excluded — counting them would double it.
export async function getAccountBalances() {
  const [accounts, saleIn, purchaseOut, partyMoves, txMoves] = await Promise.all([
    db.account.findMany({ orderBy: [{ type: "asc" }, { createdAt: "asc" }] }),
    db.salePayment.groupBy({
      by: ["paymentMethod"],
      where: { source: "CASH" },
      _sum: { amountCents: true },
    }),
    db.purchasePayment.groupBy({
      by: ["paymentMethod"],
      where: { source: "CASH" },
      _sum: { amountCents: true },
    }),
    db.partyPayment.groupBy({
      by: ["paymentMethod", "direction"],
      _sum: { amountCents: true },
    }),
    db.transaction.groupBy({
      by: ["paymentMethod", "type"],
      where: { paymentMethod: { not: null } },
      _sum: { amountCents: true },
    }),
  ]);

  const inBy = new Map<string, number>();
  const outBy = new Map<string, number>();
  const add = (map: Map<string, number>, id: string | null, cents: number | null) => {
    if (!id || !cents) return;
    map.set(id, (map.get(id) ?? 0) + cents);
  };
  for (const r of saleIn) add(inBy, r.paymentMethod, r._sum.amountCents);
  for (const r of purchaseOut) add(outBy, r.paymentMethod, r._sum.amountCents);
  for (const r of partyMoves)
    add(r.direction === "RECEIVED" ? inBy : outBy, r.paymentMethod, r._sum.amountCents);
  for (const r of txMoves)
    add(r.type === "INCOME" ? inBy : outBy, r.paymentMethod, r._sum.amountCents);

  return accounts.map((a) => {
    const inCents = inBy.get(a.id) ?? 0;
    const outCents = outBy.get(a.id) ?? 0;
    return { ...a, inCents, outCents, balanceCents: a.openingBalanceCents + inCents - outCents };
  });
}
