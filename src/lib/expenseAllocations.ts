import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

type AllocationInput = { type: "SALE" | "PURCHASE"; billId: string; amountCents: number };

// Included wherever an expense is returned, so the form and list can show
// which bills it was charged to.
export const EXPENSE_INCLUDE = {
  category: true,
  recordedBy: { select: { name: true } },
  allocations: {
    select: {
      id: true,
      amountCents: true,
      sale: { select: { id: true, billNumber: true, totalCents: true, party: { select: { name: true } } } },
      purchase: { select: { id: true, billNumber: true, totalCents: true, party: { select: { name: true } } } },
    },
  },
} satisfies Prisma.TransactionInclude;

// Returns an error message, or null when the split is valid: every bill
// exists, no bill is listed twice, and the shares add up to the expense.
export async function validateAllocations(allocations: AllocationInput[], amountCents: number) {
  if (allocations.length === 0) return null;
  const keys = allocations.map((a) => `${a.type}:${a.billId}`);
  if (new Set(keys).size !== keys.length) return "The same bill is listed twice";
  const sum = allocations.reduce((s, a) => s + a.amountCents, 0);
  if (sum !== amountCents) return "The bill shares must add up to the expense amount";

  const saleIds = allocations.filter((a) => a.type === "SALE").map((a) => a.billId);
  const purchaseIds = allocations.filter((a) => a.type === "PURCHASE").map((a) => a.billId);
  const [sales, purchases] = await Promise.all([
    db.sale.count({ where: { id: { in: saleIds } } }),
    db.purchase.count({ where: { id: { in: purchaseIds } } }),
  ]);
  if (sales !== saleIds.length || purchases !== purchaseIds.length) return "A selected bill no longer exists";
  return null;
}

export function allocationRows(allocations: AllocationInput[]) {
  return allocations.map((a) => ({
    amountCents: a.amountCents,
    saleId: a.type === "SALE" ? a.billId : null,
    purchaseId: a.type === "PURCHASE" ? a.billId : null,
  }));
}
