// Profit on a sale from the purchases actually linked to it (goods bought
// from several suppliers and sold on one bill — see Purchase.linkedSale),
// plus any expenses charged to those bills (see ExpenseAllocation).
// Everything is pre-tax: GST collected/paid is pass-through, not profit.
//   revenue = sale items + sale charges
//   cost    = linked purchases' items + their charges (transport, loading…)
//           + expenses allocated to the sale or to any linked purchase

type Line = { lineTotalCents: number };
type Charge = { amountCents: number };
type Allocation = { amountCents: number };
type Bill = { items: Line[]; charges: Charge[]; expenseAllocations?: Allocation[] };

export function billValueCents(bill: { items: Line[]; charges: Charge[] }) {
  const itemsCents = bill.items.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const chargesCents = bill.charges.reduce((sum, c) => sum + c.amountCents, 0);
  return { itemsCents, chargesCents, totalCents: itemsCents + chargesCents };
}

// Share of expenses charged to this bill.
export function billExpensesCents(bill: { expenseAllocations?: Allocation[] }) {
  return (bill.expenseAllocations ?? []).reduce((sum, a) => sum + a.amountCents, 0);
}

export function linkedProfit(sale: Bill, purchases: Bill[]) {
  const revenueCents = billValueCents(sale).totalCents;
  const purchaseCostCents = purchases.reduce((sum, p) => sum + billValueCents(p).totalCents, 0);
  const expenseCents =
    billExpensesCents(sale) + purchases.reduce((sum, p) => sum + billExpensesCents(p), 0);
  const costCents = purchaseCostCents + expenseCents;
  const profitCents = revenueCents - costCents;
  return {
    revenueCents,
    purchaseCostCents,
    expenseCents,
    costCents,
    profitCents,
    marginPercent: revenueCents > 0 ? (profitCents / revenueCents) * 100 : 0,
  };
}
