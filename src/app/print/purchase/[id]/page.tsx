import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatBillNumber, formatCents } from "@/lib/money";
import { formatBillDate } from "@/lib/date";
import { companyLines } from "@/lib/company";
import { getCompany } from "@/lib/companyServer";
import EditCompanyLink from "@/components/EditCompanyLink";
import { displayUnit } from "@/lib/units";
import PrintButton from "@/components/PrintButton";
import EmailPdfButton from "@/components/EmailPdfButton";

export default async function PrintPurchasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const company = await getCompany();

  const { id } = await params;
  const purchase = await db.purchase.findUnique({
    where: { id },
    include: {
      account: { select: { name: true } },
      party: true,
      items: { include: { item: { select: { name: true, unit: true } } } },
      charges: true,
      payments: { orderBy: { date: "asc" } },
    },
  });
  if (!purchase) notFound();

  const balanceCents = purchase.totalCents - purchase.paidCents;

  return (
    <div className="mx-auto max-w-2xl p-8 print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <a href="/purchase" className="text-sm text-black/60 underline underline-offset-4">
          Back to Purchase
        </a>
        <div className="flex items-center gap-2">
          <EmailPdfButton
            endpoint={`/api/print/purchase/${purchase.id}/email`}
            defaultRecipient={
              purchase.party?.email
                ? { name: purchase.party.name, email: purchase.party.email }
                : null
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
          <p className="text-lg font-semibold">Purchase Bill</p>
          <p className="text-sm text-black/60">Bill #{formatBillNumber(purchase.billNumber)}</p>
          <p className="text-sm text-black/60">{formatBillDate(purchase.date)}</p>
        </div>
      </div>

      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide text-black/50">Supplier</p>
        <p className="text-base font-medium">{purchase.party?.name ?? "—"}</p>
        {purchase.party?.phone && <p className="text-sm text-black/60">{purchase.party.phone}</p>}
        {purchase.party?.address && (
          <p className="text-sm text-black/60">{purchase.party.address}</p>
        )}
        {purchase.party?.gstNumber && (
          <p className="text-sm text-black/60">GSTIN: {purchase.party.gstNumber}</p>
        )}
      </div>

      <table className="mb-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/20 text-left">
            <th className="py-2">Item</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Price</th>
            <th className="py-2 text-right">Tax</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {purchase.items.map((l) => (
            <tr key={l.id} className="border-b border-black/5">
              <td className="py-2">
                {l.item.name}
                {l.ffaGrade && <span className="text-black/50"> ({l.ffaGrade})</span>}
              </td>
              <td className="py-2 text-right">
                {l.quantity} {displayUnit(l.item.unit)}
              </td>
              <td className="py-2 text-right">{formatCents(l.priceCents)}</td>
              <td className="py-2 text-right">
                {l.taxPercent > 0 ? `${l.taxPercent}% (${formatCents(l.taxCents)})` : "—"}
              </td>
              <td className="py-2 text-right">{formatCents(l.lineTotalCents + l.taxCents)}</td>
            </tr>
          ))}
          {purchase.charges.map((c) => (
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
        <div className="flex justify-between font-medium">
          <span>Total</span>
          <span>{formatCents(purchase.totalCents)}</span>
        </div>
        <div className="flex justify-between text-black/60">
          <span>Paid ({purchase.account.name})</span>
          <span>{formatCents(purchase.paidCents)}</span>
        </div>
        <div className="flex justify-between border-t border-black/10 pt-1 font-semibold">
          <span>Balance</span>
          <span className={balanceCents > 0 ? "text-[#d03b3b]" : "text-[#0ca30c]"}>
            {balanceCents > 0 ? formatCents(balanceCents) : "Paid in full"}
          </span>
        </div>
      </div>

      {purchase.notes && (
        <p className="mt-6 border-t border-black/10 pt-3 text-sm text-black/60">
          {purchase.notes}
        </p>
      )}

      <p className="mt-8 text-xs text-black/40">
        Printed on {new Date().toLocaleString()} by {session.name}
      </p>
    </div>
  );
}
