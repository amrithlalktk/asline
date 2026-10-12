import { formatBillNumber, formatCents } from "@/lib/money";
import type { PartyPaymentDirection, PaymentSource } from "@/lib/types";

export type LedgerEntry = {
  date: string | Date;
  type: string;
  ref: string;
  note?: string;
  amountCents: number;
  // Set only for entries tied to an actual Sale/Purchase (not Advance
  // entries) — lets the UI offer a click-to-preview on the reference.
  bill?: { type: "SALE" | "PURCHASE"; id: string };
};

// Only the fields this module actually reads — `date` as `string | Date` so
// this works equally against JSON-serialized client data (Sale/Purchase
// from @/lib/types, dates already strings) and raw Prisma query results in
// a server component (dates are real Date objects there).
type LedgerPayment = {
  date: string | Date;
  amountCents: number;
  source: PaymentSource;
  // Set when this payment overshot the bill's due amount — see
  // PartyPayment.sourceSalePayment/sourcePurchasePayment. Folded into this
  // payment's own ledger entry (see below) instead of showing as a second,
  // separate "Advance" entry.
  excessPartyPayment: { amountCents: number } | null;
};
type LedgerSale = {
  id: string;
  date: string | Date;
  billNumber: number;
  totalCents: number;
  payments: LedgerPayment[];
};
type LedgerPurchase = {
  id: string;
  date: string | Date;
  billNumber: number;
  totalCents: number;
  payments: LedgerPayment[];
};
type LedgerAdvance = {
  date: string | Date;
  direction: PartyPaymentDirection;
  amountCents: number;
  notes: string | null;
  // Non-null when this advance is the excess half of a specific bill
  // payment — already represented by that payment's own merged ledger
  // entry, so it's skipped here rather than shown a second time.
  sourceSalePaymentId?: string | null;
  sourcePurchasePaymentId?: string | null;
};

// One combined, chronological account of every event that moved this
// party's balance — sales/purchases (full invoice amount) plus each
// payment against them, plus advances taken/given outside any invoice.
// A Sale/Purchase's own paidCents already reflects payments regardless of
// source, but a payment settled from advance credit (source: "ADVANCE")
// contributes $0 here — that reduction already happened when the advance
// itself was received/paid, so counting it again would double it (see
// getPartyBalanceMap, which this mirrors exactly).
export function buildLedger(
  sales: LedgerSale[],
  purchases: LedgerPurchase[],
  advances: LedgerAdvance[]
) {
  const entries: LedgerEntry[] = [];

  for (const s of sales) {
    const bill = { type: "SALE" as const, id: s.id };
    entries.push({
      date: s.date,
      type: "Sale",
      ref: `Sale #${formatBillNumber(s.billNumber)}`,
      amountCents: s.totalCents,
      bill,
    });
    for (const p of s.payments) {
      if (p.source === "ADVANCE") {
        entries.push({
          date: p.date,
          type: "Advance applied",
          ref: `Sale #${formatBillNumber(s.billNumber)}`,
          note: "settled from advance credit — no balance change",
          amountCents: 0,
          bill,
        });
      } else {
        const excessCents = p.excessPartyPayment?.amountCents ?? 0;
        entries.push({
          date: p.date,
          type: "Payment received",
          ref: `Sale #${formatBillNumber(s.billNumber)}`,
          note:
            excessCents > 0
              ? `${formatCents(p.amountCents)} applied to this bill, ${formatCents(excessCents)} added as advance for the next bill`
              : undefined,
          amountCents: -(p.amountCents + excessCents),
          bill,
        });
      }
    }
  }

  for (const p of purchases) {
    const bill = { type: "PURCHASE" as const, id: p.id };
    entries.push({
      date: p.date,
      type: "Purchase",
      ref: `Purchase #${formatBillNumber(p.billNumber)}`,
      amountCents: -p.totalCents,
      bill,
    });
    for (const pay of p.payments) {
      if (pay.source === "ADVANCE") {
        entries.push({
          date: pay.date,
          type: "Advance applied",
          ref: `Purchase #${formatBillNumber(p.billNumber)}`,
          note: "settled from advance credit — no balance change",
          amountCents: 0,
          bill,
        });
      } else {
        const excessCents = pay.excessPartyPayment?.amountCents ?? 0;
        entries.push({
          date: pay.date,
          type: "Payment made",
          ref: `Purchase #${formatBillNumber(p.billNumber)}`,
          note:
            excessCents > 0
              ? `${formatCents(pay.amountCents)} applied to this bill, ${formatCents(excessCents)} added as advance for the next bill`
              : undefined,
          amountCents: pay.amountCents + excessCents,
          bill,
        });
      }
    }
  }

  for (const a of advances) {
    // Already shown as part of the bill payment that created it (see the
    // sale/purchase payment loops above) — showing it again here would
    // double it up.
    if (a.sourceSalePaymentId || a.sourcePurchasePaymentId) continue;
    entries.push({
      date: a.date,
      type: a.direction === "RECEIVED" ? "Advance received" : "Advance paid",
      ref: a.notes || "—",
      amountCents: a.direction === "RECEIVED" ? -a.amountCents : a.amountCents,
    });
  }

  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return entries;
}

// Running balance per ledger entry, seeded from the party's opening
// balance — same math used by both the on-screen statement and the
// printable/exported versions.
export function runningBalances(ledger: LedgerEntry[], openingBalanceCents: number) {
  return ledger.reduce<number[]>((acc, entry) => {
    const prev = acc.length > 0 ? acc[acc.length - 1] : openingBalanceCents;
    acc.push(prev + entry.amountCents);
    return acc;
  }, []);
}
