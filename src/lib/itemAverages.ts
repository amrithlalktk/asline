// Per-item totals and weighted average price across a bill's lines (e.g.
// every supplier entry of a combined purchase bill). Average = total
// amount ÷ total quantity, so bigger lots weigh more. Amounts are pre-tax.
// When the bill carries expenses, they're shared across items by value to
// give an average landed cost too.
export function itemAverages(
  lines: { itemId: string; name: string; unit: string; quantity: number; lineTotalCents: number }[],
  expensesCents = 0
) {
  const byItem = new Map<string, { itemId: string; name: string; unit: string; quantity: number; amountCents: number }>();
  for (const l of lines) {
    const row = byItem.get(l.itemId) ?? { itemId: l.itemId, name: l.name, unit: l.unit, quantity: 0, amountCents: 0 };
    row.quantity += l.quantity;
    row.amountCents += l.lineTotalCents;
    byItem.set(l.itemId, row);
  }
  const goodsCents = [...byItem.values()].reduce((s, r) => s + r.amountCents, 0);
  return [...byItem.values()].map((r) => {
    const expenseShareCents = goodsCents > 0 ? Math.round((expensesCents * r.amountCents) / goodsCents) : 0;
    return {
      ...r,
      avgPriceCents: r.quantity > 0 ? Math.round(r.amountCents / r.quantity) : 0,
      expenseShareCents,
      avgLandedCents: r.quantity > 0 ? Math.round((r.amountCents + expenseShareCents) / r.quantity) : 0,
    };
  });
}
