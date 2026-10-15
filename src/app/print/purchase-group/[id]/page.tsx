import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBillNumber, formatCents } from "@/lib/money";
import { formatBillDate, formatDateTime } from "@/lib/date";
import { companyLines } from "@/lib/company";
import { getCompany } from "@/lib/companyServer";
import EditCompanyLink from "@/components/EditCompanyLink";
import { displayUnit } from "@/lib/units";
import PrintButton from "@/components/PrintButton";
import { itemAverages } from "@/lib/itemAverages";

// Printable combined purchase bill: one section per supplier, then the
// grand total across all of them.
export default async function PrintPurchaseGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const company = await getCompany();

  const { id } = await params;
  const group = await db.purchaseGroup.findUnique({
    where: { id },
    include: {
      purchases: {
        orderBy: { billNumber: "asc" },
        include: {
          party: true,
          items: { include: { item: { select: { name: true, unit: true } } } },
          charges: true,
        },
      },
    },
  });
  if (!group) notFound();

  // Bill-level expenses (lorry hire, loading…) charged to its parts.
  const expenses = await db.transaction.findMany({
    where: { allocations: { some: { purchase: { groupId: id } } } },
    select: { id: true, description: true, amountCents: true },
    orderBy: { date: "asc" },
  });
  const expensesCents = expenses.reduce((s, e) => s + e.amountCents, 0);
  const averages = itemAverages(
    group.purchases.flatMap((p) =>
      p.items.map((l) => ({
        itemId: l.itemId,
        name: l.item.name,
        unit: l.item.unit,
        quantity: l.quantity,
        lineTotalCents: l.lineTotalCents,
      }))
    ),
    expensesCents
  );

  const total = group.purchases.reduce((s, p) => s + p.totalCents, 0);
  const paid = group.purchases.reduce((s, p) => s + p.paidCents, 0);

  return (
    <div className="mx-auto max-w-2xl p-8 print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <a href="/purchase" className="text-sm text-black/60 underline underline-offset-4">
          Back to Purchase
        </a>
        <PrintButton />
      </div>

      <div className="mb-6 flex items-start justify-between border-b border-black/10 pb-4">
        <div>
          <h1 className="text-xl font-semibold">{company.name}</h1>
          {companyLines(company).map((line) => (
            <p key={line} className="text-sm whitespace-pre-line text-black/60">
              {line}
            </p>
          ))}
          <EditCompanyLink role={session.role} />
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">Purchase Bill</p>
          <p className="text-sm text-black/60">Bill #{formatBillNumber(group.number)}</p>
          <p className="text-sm text-black/60">{formatBillDate(group.date)}</p>
          <p className="text-sm text-black/60">
            {group.purchases.length} supplier{group.purchases.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {group.purchases.map((p) => (
        <div key={p.id} className="mb-5 break-inside-avoid">
          <p className="mb-1 font-medium">{p.party?.name ?? "No supplier"}</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/20 text-left">
                <th className="py-1.5">Item</th>
                <th className="py-1.5 pl-4 text-right">Qty</th>
                <th className="py-1.5 pl-4 text-right">Rate</th>
                <th className="py-1.5 pl-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {p.items.map((l) => (
                <tr key={l.id} className="border-b border-black/5">
                  <td className="py-1.5">
                    {l.item.name}
                    {l.ffaGrade && <span className="text-black/50"> ({l.ffaGrade})</span>}
                  </td>
                  <td className="py-1.5 pl-4 text-right whitespace-nowrap">
                    {l.quantity} {displayUnit(l.item.unit)}
                  </td>
                  <td className="py-1.5 pl-4 text-right">{formatCents(l.priceCents)}</td>
                  <td className="py-1.5 pl-4 text-right">{formatCents(l.lineTotalCents + l.taxCents)}</td>
                </tr>
              ))}
              {p.charges.map((c) => (
                <tr key={c.id} className="border-b border-black/5 text-black/60">
                  <td className="py-1.5" colSpan={3}>
                    {c.label}
                  </td>
                  <td className="py-1.5 pl-4 text-right">{formatCents(c.amountCents)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1.5 text-black/60" colSpan={3}>
                  Subtotal · paid {formatCents(p.paidCents)}
                </td>
                <td className="py-1.5 pl-4 text-right font-medium">{formatCents(p.totalCents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}

      <div className="mb-5 break-inside-avoid">
        <p className="mb-1 font-medium">Item summary</p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/20 text-left">
              <th className="py-1.5">Item</th>
              <th className="py-1.5 pl-4 text-right">Total qty</th>
              <th className="py-1.5 pl-4 text-right">Amount</th>
              <th className="py-1.5 pl-4 text-right">Avg price</th>
              {expensesCents > 0 && <th className="py-1.5 pl-4 text-right">Avg incl. expenses</th>}
            </tr>
          </thead>
          <tbody>
            {averages.map((a) => (
              <tr key={a.itemId} className="border-b border-black/5">
                <td className="py-1.5">{a.name}</td>
                <td className="py-1.5 pl-4 text-right whitespace-nowrap">
                  {Number(a.quantity.toFixed(2))} {displayUnit(a.unit)}
                </td>
                <td className="py-1.5 pl-4 text-right">{formatCents(a.amountCents)}</td>
                <td className="py-1.5 pl-4 text-right font-semibold">{formatCents(a.avgPriceCents)}</td>
                {expensesCents > 0 && <td className="py-1.5 pl-4 text-right">{formatCents(a.avgLandedCents)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {expenses.length > 0 && (
        <div className="mb-5 break-inside-avoid">
          <p className="mb-1 font-medium">Expenses</p>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-black/5">
                  <td className="py-1.5">{e.description}</td>
                  <td className="py-1.5 pl-4 text-right">{formatCents(e.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="ml-auto flex max-w-xs flex-col gap-1 border-t border-black/20 pt-2 text-sm">
        <div className="flex justify-between">
          <span>Goods</span>
          <span>{formatCents(total)}</span>
        </div>
        {expensesCents > 0 && (
          <div className="flex justify-between">
            <span>Expenses</span>
            <span>{formatCents(expensesCents)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold">
          <span>Bill total</span>
          <span>{formatCents(total + expensesCents)}</span>
        </div>
        <div className="flex justify-between text-black/60">
          <span>Paid to suppliers</span>
          <span>{formatCents(paid)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Due to suppliers</span>
          <span className={total - paid > 0 ? "text-[#d03b3b]" : "text-[#0ca30c]"}>
            {total - paid > 0 ? formatCents(total - paid) : "Paid in full"}
          </span>
        </div>
      </div>

      {group.notes && (
        <p className="mt-6 border-t border-black/10 pt-3 text-sm text-black/60">{group.notes}</p>
      )}
      <p className="mt-8 text-xs text-black/40">
        Printed on {formatDateTime()} by {session.name}
      </p>
    </div>
  );
}
