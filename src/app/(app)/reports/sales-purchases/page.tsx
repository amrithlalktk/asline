"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBillNumber, formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import SummaryCard from "@/components/SummaryCard";
import Card from "@/components/Card";
import SuggestInput from "@/components/SuggestInput";
import { downloadReportCsv, downloadReportPdf } from "@/lib/reportExport";
import {
  TX_HEADER,
  TX_TAX_HEADER,
  paymentRemarks,
  taxLineCsvRows,
  txCsvRows,
  useDefaultDateRange,
  type TaxLineRow,
  type TxRow,
  type TxType,
} from "@/lib/reportHelpers";
import type { Item, Party, Purchase, Sale } from "@/lib/types";
import BillPreviewModal, { type PreviewBillType } from "@/components/BillPreviewModal";
import EmailPdfButton from "@/components/EmailPdfButton";

export default function SalesPurchasesReportPage() {
  const { from: txFrom, to: txTo, setFrom: setTxFrom, setTo: setTxTo, ready } = useDefaultDateRange();
  const [txType, setTxType] = useState<TxType | "">("");
  const [txPartyName, setTxPartyName] = useState("");
  const [txItemName, setTxItemName] = useState("");
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [txRows, setTxRows] = useState<TxRow[]>([]);
  const [taxRows, setTaxRows] = useState<TaxLineRow[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [taxOnly, setTaxOnly] = useState(false);
  const [generatedBy, setGeneratedBy] = useState("");
  const [previewBill, setPreviewBill] = useState<{ type: PreviewBillType; id: string } | null>(
    null
  );

  useEffect(() => {
    fetch("/api/parties")
      .then((res) => res.json())
      .then(setParties);
    fetch("/api/items")
      .then((res) => res.json())
      .then(setItems);
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((d) => setGeneratedBy(d.name ?? ""));
  }, []);

  const loadTx = useCallback(async () => {
    if (!ready) return;
    setTxLoading(true);
    const matchedParty = parties.find(
      (p) => p.name.toLowerCase() === txPartyName.trim().toLowerCase()
    );
    const matchedItem = items.find(
      (i) => i.name.toLowerCase() === txItemName.trim().toLowerCase()
    );

    const params = new URLSearchParams({ from: txFrom, to: txTo, pageSize: "1000" });
    if (matchedParty) params.set("partyId", matchedParty.id);
    if (matchedItem) params.set("itemId", matchedItem.id);

    const [sales, purchases] = await Promise.all([
      txType === "PURCHASE"
        ? Promise.resolve<Sale[]>([])
        : fetch(`/api/sales?${params.toString()}`)
            .then((res) => res.json())
            .then((d) => d.sales as Sale[]),
      txType === "SALE"
        ? Promise.resolve<Purchase[]>([])
        : fetch(`/api/purchases?${params.toString()}`)
            .then((res) => res.json())
            .then((d) => d.purchases as Purchase[]),
    ]);

    const rows: TxRow[] = [
      ...sales.map((s): TxRow => ({
        id: s.id,
        type: "SALE",
        billNumber: s.billNumber,
        date: s.date,
        partyName: s.party?.name ?? "Cash sale",
        items: s.items.map((l) => ({
          name: l.item.name,
          quantity: l.quantity,
          priceCents: l.priceCents,
        })),
        totalCents: s.totalCents,
        paidCents: s.paidCents,
        taxCents: s.items.reduce((sum, l) => sum + l.taxCents, 0),
        remarks: paymentRemarks(s.payments),
      })),
      ...purchases.map((p): TxRow => ({
        id: p.id,
        type: "PURCHASE",
        billNumber: p.billNumber,
        date: p.date,
        partyName: p.party?.name ?? "—",
        items: p.items.map((l) => ({
          name: l.item.name,
          quantity: l.quantity,
          priceCents: l.priceCents,
        })),
        totalCents: p.totalCents,
        paidCents: p.paidCents,
        taxCents: p.items.reduce((sum, l) => sum + l.taxCents, 0),
        remarks: paymentRemarks(p.payments),
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const taxLines: TaxLineRow[] = [
      ...sales.flatMap((s) =>
        s.items
          .filter((l) => l.taxCents > 0)
          .map((l): TaxLineRow => ({
            type: "SALE",
            billNumber: s.billNumber,
            date: s.date,
            partyName: s.party?.name ?? "Cash sale",
            itemName: l.item.name,
            quantity: l.quantity,
            taxPercent: l.taxPercent,
            taxCents: l.taxCents,
          }))
      ),
      ...purchases.flatMap((p) =>
        p.items
          .filter((l) => l.taxCents > 0)
          .map((l): TaxLineRow => ({
            type: "PURCHASE",
            billNumber: p.billNumber,
            date: p.date,
            partyName: p.party?.name ?? "—",
            itemName: l.item.name,
            quantity: l.quantity,
            taxPercent: l.taxPercent,
            taxCents: l.taxCents,
          }))
      ),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setTxRows(rows);
    setTaxRows(taxLines);
    setTxLoading(false);
  }, [txFrom, txTo, txType, txPartyName, txItemName, parties, items, ready]);

  useEffect(() => {
    loadTx();
  }, [loadTx]);

  function handleTxExportCsv() {
    const empty = taxOnly ? taxRows.length === 0 : txRows.length === 0;
    if (empty) return;
    downloadReportCsv({
      filename: taxOnly
        ? `tax_${txFrom}_to_${txTo}.csv`
        : `sales_purchases_${txFrom}_to_${txTo}.csv`,
      title: taxOnly
        ? `Tax report (${txFrom} to ${txTo})`
        : `Sales & Purchases report (${txFrom} to ${txTo})`,
      header: taxOnly ? TX_TAX_HEADER : TX_HEADER,
      rows: taxOnly ? taxLineCsvRows(taxRows) : txCsvRows(txRows),
      generatedBy,
    });
  }

  function handleTxExportPdf() {
    const empty = taxOnly ? taxRows.length === 0 : txRows.length === 0;
    if (empty) return;
    downloadReportPdf({
      filename: taxOnly
        ? `tax_${txFrom}_to_${txTo}.pdf`
        : `sales_purchases_${txFrom}_to_${txTo}.pdf`,
      title: taxOnly
        ? `Tax report (${txFrom} to ${txTo})`
        : `Sales & Purchases report (${txFrom} to ${txTo})`,
      header: taxOnly ? TX_TAX_HEADER : TX_HEADER,
      rows: taxOnly ? taxLineCsvRows(taxRows) : txCsvRows(txRows),
      generatedBy,
    });
  }

  const txTotalSaleCents = txRows
    .filter((r) => r.type === "SALE")
    .reduce((sum, r) => sum + r.totalCents, 0);
  const txTotalPurchaseCents = txRows
    .filter((r) => r.type === "PURCHASE")
    .reduce((sum, r) => sum + r.totalCents, 0);
  const txTotalTaxCents = taxRows.reduce((sum, r) => sum + r.taxCents, 0);
  const hasTxFilters = Boolean(txType || txPartyName || txItemName);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Sale &amp; Purchase</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Filter by date, party, or item and export as CSV/PDF.
        </p>
      </div>

      <Card className="print:hidden">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">From</label>
            <input
              type="date"
              value={txFrom}
              onChange={(e) => setTxFrom(e.target.value)}
              className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">To</label>
            <input
              type="date"
              value={txTo}
              onChange={(e) => setTxTo(e.target.value)}
              className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Type</label>
            <select
              value={txType}
              onChange={(e) => setTxType(e.target.value as TxType | "")}
              className="bg-transparent py-1 text-sm focus:outline-none"
            >
              <option value="">Sale &amp; Purchase</option>
              <option value="SALE">Sale only</option>
              <option value="PURCHASE">Purchase only</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Party</label>
            <SuggestInput
              value={txPartyName}
              onChange={setTxPartyName}
              options={parties.map((p) => p.name)}
              placeholder="All parties"
              className="w-44 rounded-md border border-black/15 px-2 py-1 text-sm focus:outline-none dark:border-white/15 dark:bg-transparent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Item</label>
            <SuggestInput
              value={txItemName}
              onChange={setTxItemName}
              options={items.map((i) => i.name)}
              placeholder="All items"
              className="w-44 rounded-md border border-black/15 px-2 py-1 text-sm focus:outline-none dark:border-white/15 dark:bg-transparent"
            />
          </div>
          <label className="flex items-center gap-1.5 pb-1.5 text-sm">
            <input
              type="checkbox"
              checked={taxOnly}
              onChange={(e) => setTaxOnly(e.target.checked)}
            />
            Tax amount only
          </label>
          {hasTxFilters && (
            <button
              onClick={() => {
                setTxType("");
                setTxPartyName("");
                setTxItemName("");
              }}
              className="text-sm underline underline-offset-4"
            >
              Clear filters
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              onClick={handleTxExportCsv}
              disabled={taxOnly ? taxRows.length === 0 : txRows.length === 0}
              className="rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-40 dark:border-white/15"
            >
              Export CSV
            </button>
            <button
              onClick={handleTxExportPdf}
              disabled={taxOnly ? taxRows.length === 0 : txRows.length === 0}
              className="rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-40 dark:border-white/15"
            >
              Export PDF
            </button>
            <EmailPdfButton
              endpoint="/api/reports/email-pdf"
              body={{
                filename: taxOnly
                  ? `tax_${txFrom}_to_${txTo}.pdf`
                  : `sales_purchases_${txFrom}_to_${txTo}.pdf`,
                title: taxOnly
                  ? `Tax report (${txFrom} to ${txTo})`
                  : `Sales & Purchases report (${txFrom} to ${txTo})`,
                header: taxOnly ? TX_TAX_HEADER : TX_HEADER,
                rows: taxOnly ? taxLineCsvRows(taxRows) : txCsvRows(txRows),
              }}
              disabled={taxOnly ? taxRows.length === 0 : txRows.length === 0}
            />
            <button
              onClick={() => window.print()}
              className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15"
            >
              Print
            </button>
          </div>
        </div>
      </Card>
      <p className="hidden text-sm text-black/60 print:block">
        {txFrom} to {txTo}
      </p>

      {taxOnly ? (
        <div className="grid grid-cols-1 sm:grid-cols-1">
          <SummaryCard label="Total tax" value={formatCents(txTotalTaxCents)} tone="positive" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SummaryCard label="Total sales" value={formatCents(txTotalSaleCents)} tone="positive" />
          <SummaryCard label="Total purchases" value={formatCents(txTotalPurchaseCents)} tone="negative" />
        </div>
      )}

      <Card className="p-0">
        <div className="overflow-x-auto">
          {taxOnly ? (
            <table className="w-full text-sm">
              <thead className="text-left text-black/60 dark:text-white/60">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Bill #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Party</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Tax %</th>
                  <th className="px-4 py-3 text-right">Tax Amount</th>
                </tr>
              </thead>
              <tbody>
                {taxRows.map((r, index) => (
                  <tr key={index} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-4 py-3">
                      <span className={r.type === "SALE" ? "text-[#0ca30c]" : "text-[#2a78d6]"}>
                        {r.type === "SALE" ? "Sale" : "Purchase"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">#{formatBillNumber(r.billNumber)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="px-4 py-3">{r.partyName}</td>
                    <td className="px-4 py-3">{r.itemName}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{r.quantity}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{r.taxPercent}%</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatCents(r.taxCents)}
                    </td>
                  </tr>
                ))}
                {!txLoading && taxRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-black/50 dark:text-white/50">
                      No taxed items match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-black/60 dark:text-white/60">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Bill #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Party</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 text-center">Weight</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {txRows.map((r, index) => {
                  const balance = r.totalCents - r.paidCents;
                  return (
                    <tr key={index} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-4 py-3">
                        <span className={r.type === "SALE" ? "text-[#0ca30c]" : "text-[#2a78d6]"}>
                          {r.type === "SALE" ? "Sale" : "Purchase"}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setPreviewBill({ type: r.type, id: r.id })}
                          className="underline underline-offset-4 hover:text-black dark:hover:text-white"
                        >
                          #{formatBillNumber(r.billNumber)}
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.date)}</td>
                      <td className="px-4 py-3">{r.partyName}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          {r.items.map((i, itemIndex) => (
                            <span key={itemIndex}>{i.name}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col gap-0.5">
                          {r.items.map((i, itemIndex) => (
                            <span key={itemIndex}>{i.quantity}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          {r.items.map((i, itemIndex) => (
                            <span key={itemIndex}>{formatCents(i.priceCents)}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {formatCents(r.totalCents)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right whitespace-nowrap ${
                          balance > 0 ? "text-[#d03b3b]" : "text-[#0ca30c]"
                        }`}
                      >
                        {balance > 0 ? formatCents(balance) : "Paid"}
                      </td>
                      <td className="px-4 py-3 text-xs text-black/60 dark:text-white/60">
                        {r.remarks}
                      </td>
                    </tr>
                  );
                })}
                {!txLoading && txRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-6 text-center text-black/50 dark:text-white/50">
                      No sales or purchases match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
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
