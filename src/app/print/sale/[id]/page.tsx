import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBillNumber, formatCents } from "@/lib/money";
import { formatBillDate } from "@/lib/date";
import { companyLines } from "@/lib/company";
import { getCompany } from "@/lib/companyServer";
import EditCompanyLink from "@/components/EditCompanyLink";
import { displayUnit } from "@/lib/units";
import { billFfaAmountCents } from "@/lib/ffa";
import PrintButton from "@/components/PrintButton";
import EmailPdfButton from "@/components/EmailPdfButton";

export default async function PrintSalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const company = await getCompany();

  const { id } = await params;
  const sale = await db.sale.findUnique({
    where: { id },
    include: {
      account: { select: { name: true } },
      party: true,
      items: { include: { item: { select: { name: true, unit: true } } } },
      charges: true,
      payments: { orderBy: { date: "asc" } },
    },
  });
  if (!sale) notFound();

  const balanceCents = sale.totalCents - sale.paidCents;
  const ffaCents = billFfaAmountCents(sale.items);

  return (
    <div className="mx-auto max-w-2xl p-8 print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <a href="/sale" className="text-sm text-black/60 underline underline-offset-4">
          Back to Sale
        </a>
        <div className="flex items-center gap-2">
          <EmailPdfButton
            endpoint={`/api/print/sale/${sale.id}/email`}
            defaultRecipient={
              sale.party?.email ? { name: sale.party.name, email: sale.party.email } : null
            }
          />
          <PrintButton />
        </div>
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
          <p className="text-lg font-semibold">Sale Invoice</p>
          <p className="text-sm text-black/60">Bill #{formatBillNumber(sale.billNumber)}</p>
          <p className="text-sm text-black/60">{formatBillDate(sale.date)}</p>
        </div>
      </div>

      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-black/50">Billed to</p>
        <p className="text-base font-medium">{sale.party?.name ?? "Cash sale"}</p>
        {sale.party?.phone && <p className="text-sm text-black/60">{sale.party.phone}</p>}
        {sale.party?.address && <p className="text-sm text-black/60">{sale.party.address}</p>}
        {sale.party?.gstNumber && (
          <p className="text-sm text-black/60">GSTIN: {sale.party.gstNumber}</p>
        )}
      </div>

      <table className="mb-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/20 text-left">
            <th className="py-2">Item</th>
            <th className="py-2 pl-4 text-right">Qty</th>
            <th className="py-2 pl-4 text-right">Price</th>
            <th className="py-2 pl-4 text-right">Tax</th>
            <th className="py-2 pl-4 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((l) => (
            <tr key={l.id} className="border-b border-black/5">
              <td className="py-2">
                {l.item.name}
                {l.ffaGrade && <span className="text-black/50"> ({l.ffaGrade})</span>}
              </td>
              <td className="py-2 pl-4 text-right whitespace-nowrap">
                {l.quantity} {displayUnit(l.item.unit)}
              </td>
              <td className="py-2 pl-4 text-right">
                {formatCents(l.priceCents)}
                {l.ffaBonusCents > 0 && (
                  <span className="block text-xs text-black/50">
                    {formatCents(l.priceCents - l.ffaBonusCents)} + {formatCents(l.ffaBonusCents)} FFA
                  </span>
                )}
              </td>
              <td className="py-2 pl-4 text-right">
                {l.taxPercent > 0 ? `${l.taxPercent}% (${formatCents(l.taxCents)})` : "—"}
              </td>
              <td className="py-2 pl-4 text-right">{formatCents(l.lineTotalCents + l.taxCents)}</td>
            </tr>
          ))}
          {sale.charges.map((c) => (
            <tr key={c.id} className="border-b border-black/5">
              <td className="py-2 text-black/60" colSpan={4}>
                {c.label}
              </td>
              <td className="py-2 text-right">{formatCents(c.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto flex max-w-xs flex-col gap-1 text-sm">
        {ffaCents !== 0 && (
          <>
            <div className="flex justify-between text-black/60">
              <span>Sold amount (before FFA)</span>
              <span>{formatCents(sale.totalCents - ffaCents)}</span>
            </div>
            <div className="flex justify-between text-black/60">
              <span>FFA addition</span>
              <span>+{formatCents(ffaCents)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between font-medium">
          <span>Total</span>
          <span>{formatCents(sale.totalCents)}</span>
        </div>
        <div className="flex justify-between text-black/60">
          <span>Paid ({sale.account.name})</span>
          <span>{formatCents(sale.paidCents)}</span>
        </div>
        <div className="flex justify-between border-t border-black/10 pt-1 font-semibold">
          <span>Balance</span>
          <span className={balanceCents > 0 ? "text-[#d03b3b]" : "text-[#0ca30c]"}>
            {balanceCents > 0 ? formatCents(balanceCents) : "Paid in full"}
          </span>
        </div>
      </div>

      {sale.notes && (
        <p className="mt-6 border-t border-black/10 pt-3 text-sm text-black/60">{sale.notes}</p>
      )}

      <p className="mt-8 text-xs text-black/40">
        Printed on {new Date().toLocaleString()} by {session.name}
      </p>
    </div>
  );
}
