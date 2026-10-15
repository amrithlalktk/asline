import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { formatBillDate, formatDateTime } from "@/lib/date";
import {
  getAvailableAdvanceForPurchasesMap,
  getAvailableAdvanceForSalesMap,
  getPartyBalanceMap,
} from "@/lib/balances";
import { buildLedger, runningBalances } from "@/lib/partyLedger";
import { companyLines } from "@/lib/company";
import { getCompany } from "@/lib/companyServer";
import EditCompanyLink from "@/components/EditCompanyLink";
import PrintButton from "@/components/PrintButton";
import type { Prisma } from "@prisma/client";

const SALE_INCLUDE = {
  party: { select: { name: true } },
  items: { include: { item: { select: { name: true, unit: true } } } },
  charges: true,
  payments: {
    orderBy: { date: "asc" },
    include: { excessPartyPayment: { select: { amountCents: true } } },
  },
  recordedBy: { select: { name: true } },
} satisfies Prisma.SaleInclude;

const PURCHASE_INCLUDE = {
  party: { select: { name: true } },
  items: { include: { item: { select: { name: true, unit: true } } } },
  charges: true,
  payments: {
    orderBy: { date: "asc" },
    include: { excessPartyPayment: { select: { amountCents: true } } },
  },
  recordedBy: { select: { name: true } },
} satisfies Prisma.PurchaseInclude;

export default async function PrintPartyStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const company = await getCompany();

  const { id } = await params;
  const party = await db.party.findUnique({ where: { id } });
  if (!party) notFound();

  const [
    sales,
    purchases,
    advances,
    dueByParty,
    availableAdvanceByParty,
    availableAdvanceForPurchaseByParty,
  ] = await Promise.all([
    db.sale.findMany({ where: { partyId: id }, include: SALE_INCLUDE, orderBy: { date: "asc" } }),
    db.purchase.findMany({
      where: { partyId: id },
      include: PURCHASE_INCLUDE,
      orderBy: { date: "asc" },
    }),
    db.partyPayment.findMany({ where: { partyId: id }, orderBy: { date: "asc" } }),
    getPartyBalanceMap(),
    getAvailableAdvanceForSalesMap(),
    getAvailableAdvanceForPurchasesMap(),
  ]);

  const balanceCents = party.openingBalanceCents + (dueByParty.get(party.id) ?? 0);
  const availableAdvanceCents = availableAdvanceByParty.get(party.id) ?? 0;
  const availableAdvanceForPurchaseCents = availableAdvanceForPurchaseByParty.get(party.id) ?? 0;

  const ledger = buildLedger(sales, purchases, advances);
  const balances = runningBalances(ledger, party.openingBalanceCents);

  return (
    <div className="mx-auto max-w-2xl p-8 print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <a
          href={`/parties/${party.id}`}
          className="text-sm text-black/60 underline underline-offset-4"
        >
          Back to {party.name}
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
          <p className="text-lg font-semibold">Party Statement</p>
          <p className="text-sm text-black/60">{party.name}</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-black/50">Balance</p>
          <p className="font-medium">
            {balanceCents === 0
              ? formatCents(0)
              : `${balanceCents > 0 ? "Receive " : "Pay "}${formatCents(Math.abs(balanceCents))}`}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-black/50">Advance available</p>
          <p className="font-medium">
            {formatCents(availableAdvanceCents || availableAdvanceForPurchaseCents)}
          </p>
          {availableAdvanceCents > 0 && (
            <p className="text-xs text-black/50">for their next sale</p>
          )}
          {availableAdvanceForPurchaseCents > 0 && (
            <p className="text-xs text-black/50">for their next purchase</p>
          )}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-black/50">Opening balance</p>
          <p className="font-medium">{formatCents(party.openingBalanceCents)}</p>
        </div>
      </div>

      <table className="mb-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/20 text-left">
            <th className="py-2">Date</th>
            <th className="py-2">Type</th>
            <th className="py-2">Reference</th>
            <th className="py-2 text-right">Debit</th>
            <th className="py-2 text-right">Credit</th>
            <th className="py-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {party.openingBalanceCents !== 0 && (
            <tr className="border-b border-black/5">
              <td className="py-2 text-black/50" colSpan={3}>
                Opening balance
              </td>
              <td className="py-2 text-right text-black/50" colSpan={2}>
                —
              </td>
              <td className="py-2 text-right font-medium">
                {formatCents(party.openingBalanceCents)}
              </td>
            </tr>
          )}
          {ledger.map((entry, index) => (
            <tr key={index} className="border-b border-black/5">
              <td className="py-2 whitespace-nowrap">{formatBillDate(entry.date)}</td>
              <td className="py-2">{entry.type}</td>
              <td className="py-2">
                {entry.ref}
                {entry.note && <span className="block text-xs text-black/50">{entry.note}</span>}
              </td>
              <td className="py-2 text-right">
                {entry.amountCents > 0 ? formatCents(entry.amountCents) : "—"}
              </td>
              <td className="py-2 text-right">
                {entry.amountCents < 0 ? formatCents(-entry.amountCents) : "—"}
              </td>
              <td className="py-2 text-right font-medium">{formatCents(balances[index])}</td>
            </tr>
          ))}
          {ledger.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-black/50">
                No sales, purchases, or advances recorded for this party yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="mt-8 text-xs text-black/40">
        Printed on {formatDateTime()} by {session.name}
      </p>
    </div>
  );
}
