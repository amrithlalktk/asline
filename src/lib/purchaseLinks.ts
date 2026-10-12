import { db } from "@/lib/db";
import { formatBillNumber } from "@/lib/money";
import { billExpensesCents, billValueCents } from "@/lib/saleProfit";
import type { Prisma } from "@prisma/client";

// Linking purchases to the sale their goods were sold on (Purchase.linkedSale)
// — shared by the sale form (POST/PATCH /api/sales) and the P&L dialog
// (/api/sales/[id]/purchases), so both follow the same rules.

export const PURCHASE_LINK_SELECT = {
  id: true,
  billNumber: true,
  date: true,
  linkedSaleId: true,
  party: { select: { name: true } },
  items: {
    select: {
      itemId: true,
      quantity: true,
      lineTotalCents: true,
      item: { select: { name: true, unit: true } },
    },
  },
  charges: { select: { label: true, amountCents: true } },
  expenseAllocations: { select: { amountCents: true } },
  group: { select: { id: true, number: true } },
} satisfies Prisma.PurchaseSelect;

type PurchaseRow = Prisma.PurchaseGetPayload<{ select: typeof PURCHASE_LINK_SELECT }>;

export function summarizePurchase(p: PurchaseRow) {
  return {
    id: p.id,
    billNumber: p.billNumber,
    date: p.date,
    partyName: p.party?.name ?? "No supplier",
    // Part of a combined bill — the picker ticks its parts together.
    groupId: p.group?.id ?? null,
    groupNumber: p.group?.number ?? null,
    lines: p.items.map((l) => ({
      itemId: l.itemId,
      name: l.item.name,
      unit: l.item.unit,
      quantity: l.quantity,
      amountCents: l.lineTotalCents,
    })),
    ...billValueCents(p),
    expensesCents: billExpensesCents(p),
  };
}

// Stock is usually collected in the weeks before the sale, occasionally
// just after.
const DAYS_BEFORE = 90;
const DAYS_AFTER = 30;
const DAY = 86400000;

// Purchases that could have supplied a sale of these items on this date:
// not linked to any other sale, and containing at least one of the items.
export async function findLinkablePurchases(opts: {
  itemIds: string[];
  date: Date;
  saleId?: string | null;
}) {
  if (opts.itemIds.length === 0) return [];
  const rows = await db.purchase.findMany({
    where: {
      OR: [{ linkedSaleId: null }, ...(opts.saleId ? [{ linkedSaleId: opts.saleId }] : [])],
      items: { some: { itemId: { in: opts.itemIds } } },
      date: {
        gte: new Date(opts.date.getTime() - DAYS_BEFORE * DAY),
        lte: new Date(opts.date.getTime() + DAYS_AFTER * DAY),
      },
    },
    select: PURCHASE_LINK_SELECT,
    orderBy: { date: "desc" },
    take: 100,
  });
  return rows.map(summarizePurchase);
}

// Error message, or null if every purchase exists and none is already
// linked to a different sale (a purchase belongs to at most one sale).
export async function validatePurchaseLinks(purchaseIds: string[], saleId: string | null) {
  if (purchaseIds.length === 0) return null;
  const ids = [...new Set(purchaseIds)];
  const rows = await db.purchase.findMany({
    where: { id: { in: ids } },
    select: { billNumber: true, linkedSaleId: true, linkedSale: { select: { billNumber: true } } },
  });
  if (rows.length !== ids.length) return "Some purchases no longer exist";
  const taken = rows.find((r) => r.linkedSaleId && r.linkedSaleId !== saleId);
  if (taken) {
    return `Purchase #${formatBillNumber(taken.billNumber)} is already linked to Sale #${formatBillNumber(taken.linkedSale?.billNumber ?? 0)} — unlink it there first.`;
  }
  return null;
}

// Makes exactly these purchases the ones linked to the sale.
export async function setPurchaseLinks(
  tx: Prisma.TransactionClient,
  saleId: string,
  purchaseIds: string[]
) {
  const ids = [...new Set(purchaseIds)];
  await tx.purchase.updateMany({
    where: { linkedSaleId: saleId, id: { notIn: ids } },
    data: { linkedSaleId: null },
  });
  if (ids.length > 0) {
    await tx.purchase.updateMany({ where: { id: { in: ids } }, data: { linkedSaleId: saleId } });
  }
}
