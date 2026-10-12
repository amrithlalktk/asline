"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { buildLedger, runningBalances } from "@/lib/partyLedger";
import { downloadReportCsv, downloadReportPdf } from "@/lib/reportExport";
import type { Party, PartyPayment, Purchase, Sale } from "@/lib/types";
import Card from "@/components/Card";
import RecordPaymentForm from "@/components/RecordPaymentForm";
import BillPreviewModal, { type PreviewBillType } from "@/components/BillPreviewModal";
import EmailPdfButton from "@/components/EmailPdfButton";

const STATEMENT_HEADER = ["Date", "Type", "Reference", "Debit", "Credit", "Balance"];

export default function PartyStatementPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [party, setParty] = useState<Party | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [advances, setAdvances] = useState<PartyPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [generatedBy, setGeneratedBy] = useState("");
  const [previewBill, setPreviewBill] = useState<{ type: PreviewBillType; id: string } | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    const [partyRes, salesRes, purchasesRes, advancesRes] = await Promise.all([
      fetch(`/api/parties/${params.id}`),
      fetch(`/api/sales?partyId=${params.id}&pageSize=1000`),
      fetch(`/api/purchases?partyId=${params.id}&pageSize=1000`),
      fetch(`/api/parties/${params.id}/payments`),
    ]);
    if (!partyRes.ok) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setParty(await partyRes.json());
    setSales((await salesRes.json()).sales);
    setPurchases((await purchasesRes.json()).purchases);
    setAdvances(await advancesRes.json());
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((d) => setGeneratedBy(d.name ?? ""));
  }, []);

  if (loading) return null;
  if (notFound || !party) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-black/60 dark:text-white/60">Party not found.</p>
        <button
          onClick={() => router.push("/parties")}
          className="self-start text-sm underline underline-offset-4"
        >
          Back to parties
        </button>
      </div>
    );
  }

  const ledger = buildLedger(sales, purchases, advances);
  const balances = runningBalances(ledger, party.openingBalanceCents);

  function statementRows() {
    const rows: string[][] = [];
    if (party!.openingBalanceCents !== 0) {
      rows.push(["", "Opening balance", "", "", "", (party!.openingBalanceCents / 100).toFixed(2)]);
    }
    ledger.forEach((entry, index) => {
      const debit = entry.amountCents > 0 ? (entry.amountCents / 100).toFixed(2) : "";
      const credit = entry.amountCents < 0 ? (-entry.amountCents / 100).toFixed(2) : "";
      rows.push([
        formatDate(entry.date),
        entry.type,
        entry.note ? `${entry.ref} (${entry.note})` : entry.ref,
        debit,
        credit,
        (balances[index] / 100).toFixed(2),
      ]);
    });
    return rows;
  }

  function handleExport(kind: "csv" | "pdf") {
    const args = {
      filename: `${party!.name.replace(/\s+/g, "_")}_statement.${kind}`,
      title: `Statement — ${party!.name}`,
      header: STATEMENT_HEADER,
      rows: statementRows(),
      generatedBy,
    };
    if (kind === "csv") downloadReportCsv(args);
    else downloadReportPdf(args);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/parties")}
          className="flex items-center gap-1.5 text-sm text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
        >
          <ArrowLeft size={16} />
          Parties
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{party.name}</h1>
          <p className="text-sm capitalize text-black/60 dark:text-white/60">
            {party.type.toLowerCase()}
            {party.phone && ` · ${party.phone}`}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/print/party/${party.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15"
          >
            Print
          </a>
          <button
            onClick={() => handleExport("csv")}
            className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15"
          >
            Export CSV
          </button>
          <button
            onClick={() => handleExport("pdf")}
            className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15"
          >
            Export PDF
          </button>
          <EmailPdfButton
            endpoint="/api/reports/email-pdf"
            body={{
              filename: `${party.name.replace(/\s+/g, "_")}_statement.pdf`,
              title: `Statement — ${party.name}`,
              header: STATEMENT_HEADER,
              rows: statementRows(),
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs text-black/50 dark:text-white/50">Balance</p>
          <p
            className={`mt-1 text-xl font-semibold ${
              party.balanceCents > 0
                ? "text-[#0ca30c]"
                : party.balanceCents < 0
                  ? "text-[#d03b3b]"
                  : ""
            }`}
          >
            {party.balanceCents === 0
              ? formatCents(0)
              : `${party.balanceCents > 0 ? "Receive " : "Pay "}${formatCents(
                  Math.abs(party.balanceCents)
                )}`}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-black/50 dark:text-white/50">Advance available</p>
          <p className="mt-1 text-xl font-semibold text-[#0ca30c]">
            {formatCents(party.availableAdvanceCents || party.availableAdvanceForPurchaseCents)}
          </p>
          {party.availableAdvanceCents > 0 && (
            <p className="text-xs text-black/50 dark:text-white/50">for their next sale</p>
          )}
          {party.availableAdvanceForPurchaseCents > 0 && (
            <p className="text-xs text-black/50 dark:text-white/50">for their next purchase</p>
          )}
        </Card>
        <Card>
          <p className="text-xs text-black/50 dark:text-white/50">Opening balance</p>
          <p className="mt-1 text-xl font-semibold">{formatCents(party.openingBalanceCents)}</p>
        </Card>
      </div>

      <Card title="Record a payment">
        <RecordPaymentForm parties={[party]} lockPartyId={party.id} onSaved={load} />
      </Card>

      <Card title="Statement" className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-black/60 dark:text-white/60">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3 text-right">Debit</th>
                <th className="px-4 py-3 text-right">Credit</th>
                <th className="px-4 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {party.openingBalanceCents !== 0 && (
                <tr className="border-t border-black/5 dark:border-white/5">
                  <td className="px-4 py-3 text-black/50 dark:text-white/50" colSpan={3}>
                    Opening balance
                  </td>
                  <td className="px-4 py-3 text-right text-black/50 dark:text-white/50" colSpan={2}>
                    —
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCents(party.openingBalanceCents)}
                  </td>
                </tr>
              )}
              {ledger.map((entry, index) => {
                return (
                  <tr key={index} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(entry.date)}</td>
                    <td className="px-4 py-3">{entry.type}</td>
                    <td className="px-4 py-3">
                      {entry.bill ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewBill({ type: entry.bill!.type, id: entry.bill!.id })
                          }
                          className="underline underline-offset-4 hover:text-black dark:hover:text-white"
                        >
                          {entry.ref}
                        </button>
                      ) : (
                        entry.ref
                      )}
                      {entry.note && (
                        <span className="block text-xs text-black/50 dark:text-white/50">
                          {entry.note}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-[#0ca30c]">
                      {entry.amountCents > 0 ? formatCents(entry.amountCents) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-[#d03b3b]">
                      {entry.amountCents < 0 ? formatCents(-entry.amountCents) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                      {formatCents(balances[index])}
                    </td>
                  </tr>
                );
              })}
              {ledger.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-black/50 dark:text-white/50">
                    No sales, purchases, or advances recorded for this party yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {previewBill && (
        <BillPreviewModal
          billType={previewBill.type}
          billId={previewBill.id}
          onClose={() => setPreviewBill(null)}
        />
      )}
    </div>
  );
}
