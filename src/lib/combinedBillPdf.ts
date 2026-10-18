import { formatBillNumber, formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { displayUnit } from "@/lib/units";

type PdfGroup = {
  number: number;
  date: string;
  purchases: {
    totalCents: number;
    paidCents: number;
    party: { name: string } | null;
    items: { quantity: number; priceCents: number; lineTotalCents: number; item: { name: string; unit: string } }[];
  }[];
  expenses: { description: string; amountCents: number }[];
};

// A combined purchase bill as a table PDF for /api/reports/email-pdf:
// each supplier's lines, the bill's expenses and the combined total.
export function combinedBillPdf(group: PdfGroup) {
  const total = group.purchases.reduce((s, p) => s + p.totalCents, 0);
  const paid = group.purchases.reduce((s, p) => s + p.paidCents, 0);
  const expensesCents = group.expenses.reduce((s, e) => s + e.amountCents, 0);
  return {
    filename: `purchase_${formatBillNumber(group.number)}.pdf`,
    title: `Purchase Bill #${formatBillNumber(group.number)} — ${formatDate(group.date)}`,
    header: ["Supplier", "Item", "Qty", "Rate", "Amount", "Paid", "Due"],
    rows: [
      ...group.purchases.flatMap((p) =>
        p.items.map((l, i) => [
          i === 0 ? (p.party?.name ?? "No supplier") : "",
          l.item.name,
          `${l.quantity} ${displayUnit(l.item.unit)}`,
          formatCents(l.priceCents),
          formatCents(l.lineTotalCents),
          i === 0 ? formatCents(p.paidCents) : "",
          i === 0 ? formatCents(p.totalCents - p.paidCents) : "",
        ])
      ),
      ...group.expenses.map((e) => ["Expense", e.description, "", "", formatCents(e.amountCents), "", ""]),
      ["", "Combined total", "", "", formatCents(total + expensesCents), formatCents(paid), formatCents(total - paid)],
    ],
  };
}
