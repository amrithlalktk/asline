"use client";

import { useEffect, useState } from "react";
import { formatBillNumber, formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { displayUnit } from "@/lib/units";
import Card from "@/components/Card";
import SummaryCard from "@/components/SummaryCard";
import EmailPdfButton from "@/components/EmailPdfButton";
import { downloadReportCsv, downloadReportPdf } from "@/lib/reportExport";
import { billExpensesCents, linkedProfit } from "@/lib/saleProfit";
import { saleLineFfaSplit } from "@/lib/ffa";
import { useAccounts } from "@/lib/useAccounts";
import { accountName, type Item, type Purchase, type Sale } from "@/lib/types";

type BillType = "SALE" | "PURCHASE";
type Bill = (Sale | Purchase) & { kind: BillType };

const inputClass =
  "rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent";

const HEADER = ["Bill #", "Date", "Party", "Item", "Qty", "Rate", "FFA", "Tax", "Amount", "Bill total", "Paid", "Balance"];

// One line per bill item, bill totals repeated on its first line only, so
// the export reads like a register.
function exportRows(bills: Bill[]) {
  return bills.flatMap((b) => {
    const balance = b.totalCents - b.paidCents;
    const lines = b.items.map((l, i) => [
      i === 0 ? formatBillNumber(b.billNumber) : "",
      i === 0 ? formatDate(b.date) : "",
      i === 0 ? (b.party?.name ?? (b.kind === "SALE" ? "Cash sale" : "—")) : "",
      l.item.name,
      `${l.quantity} ${displayUnit(l.item.unit)}`,
      (l.priceCents / 100).toFixed(2),
      l.ffaGrade ?? "",
      (l.taxCents / 100).toFixed(2),
      ((l.lineTotalCents + l.taxCents) / 100).toFixed(2),
      i === 0 ? (b.totalCents / 100).toFixed(2) : "",
      i === 0 ? (b.paidCents / 100).toFixed(2) : "",
      i === 0 ? (balance / 100).toFixed(2) : "",
    ]);
    const charges = b.charges.map((c) => [
      "", "", "", `+ ${c.label}`, "", "", "", "", (c.amountCents / 100).toFixed(2), "", "", "",
    ]);
    return [...lines, ...charges];
  });
}

// Look up one bill, or a run of bills, by bill number — sale or purchase —
// with everything about each: lines, charges, payments, balance, and for a
// sale its profit (from linked purchases where present).
export default function BillReportPage() {
  const accounts = useAccounts();
  const [type, setType] = useState<BillType>("SALE");
  const [billFrom, setBillFrom] = useState("");
  const [billTo, setBillTo] = useState("");
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [avgCost, setAvgCost] = useState<Map<string, number>>(new Map());
  const [generatedBy, setGeneratedBy] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((d) => setGeneratedBy(d.name ?? ""));
    fetch("/api/items")
      .then((res) => res.json())
      .then((items: Item[]) => setAvgCost(new Map(items.map((i) => [i.id, i.avgPurchaseCostCents]))));
  }, []);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const fromN = Number(billFrom);
    if (!fromN) return;
    const toN = Number(billTo) || fromN;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        billFrom: String(Math.min(fromN, toN)),
        billTo: String(Math.max(fromN, toN)),
        sortBy: "billNumber",
        sortDir: "asc",
        pageSize: "1000",
      });
      const res = await fetch(`/api/${type === "SALE" ? "sales" : "purchases"}?${params}`);
      const data = await res.json();
      const list = (type === "SALE" ? data.sales : data.purchases) as (Sale | Purchase)[];
      setBills(list.map((b) => ({ ...b, kind: type })));
    } finally {
      setLoading(false);
    }
  }

  const typeLabel = type === "SALE" ? "Sale" : "Purchase";
  const rangeLabel =
    !billTo || billTo === billFrom
      ? `#${formatBillNumber(Number(billFrom) || 0)}`
      : `#${formatBillNumber(Number(billFrom) || 0)} to #${formatBillNumber(Number(billTo) || 0)}`;
  const title = `${typeLabel} Bill Report (${rangeLabel})`;
  const filename = `${type.toLowerCase()}_bill_report_${billFrom}${billTo && billTo !== billFrom ? `_to_${billTo}` : ""}`;

  const list = bills ?? [];
  const total = list.reduce((s, b) => s + b.totalCents, 0);
  const paid = list.reduce((s, b) => s + b.paidCents, 0);

  function saleProfit(s: Sale) {
    if (s.linkedPurchases && s.linkedPurchases.length > 0) {
      return { ...linkedProfit(s, s.linkedPurchases), basis: `linked purchases (${s.linkedPurchases.length})` };
    }
    const revenueCents = s.items.reduce((sum, l) => sum + l.lineTotalCents, 0);
    const costCents =
      Math.round(s.items.reduce((sum, l) => sum + (avgCost.get(l.itemId) ?? 0) * l.quantity, 0)) +
      billExpensesCents(s);
    return { revenueCents, costCents, profitCents: revenueCents - costCents, basis: "average cost" };
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Bill Report</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Full details of a sale or purchase bill by its bill number — or a range of bill numbers.
        </p>
      </div>

      <Card className="print:hidden">
        <form onSubmit={handleGenerate} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Bill type</label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as BillType);
                setBills(null);
              }}
              className={inputClass}
            >
              <option value="SALE">Sale</option>
              <option value="PURCHASE">Purchase</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">
              Bill no.
            </label>
            <input
              required
              type="number"
              min="1"
              placeholder="e.g. 5"
              value={billFrom}
              onChange={(e) => setBillFrom(e.target.value)}
              className={`${inputClass} w-28`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">To bill no. (optional)</label>
            <input
              type="number"
              min="1"
              placeholder="same"
              value={billTo}
              onChange={(e) => setBillTo(e.target.value)}
              className={`${inputClass} w-28`}
            />
          </div>
          <button
            disabled={loading}
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Loading…" : "Generate"}
          </button>
          {list.length > 0 && (
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  downloadReportCsv({ filename: `${filename}.csv`, title, header: HEADER, rows: exportRows(list), generatedBy })
                }
                className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadReportPdf({ filename: `${filename}.pdf`, title, header: HEADER, rows: exportRows(list), generatedBy })
                }
                className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15"
              >
                Export PDF
              </button>
              <EmailPdfButton
                endpoint="/api/reports/email-pdf"
                body={{ filename: `${filename}.pdf`, title, header: HEADER, rows: exportRows(list) }}
              />
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15"
              >
                Print
              </button>
            </div>
          )}
        </form>
      </Card>

      {bills !== null && (
        <>
          <p className="hidden text-sm font-medium print:block">{title}</p>
          {list.length === 0 ? (
            <Card>
              <p className="text-sm text-black/50 dark:text-white/50">
                No {typeLabel.toLowerCase()} bill with that number.
              </p>
            </Card>
          ) : (
            <>
              {list.length > 1 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <SummaryCard label="Bills" value={String(new Set(list.map((b) => b.billNumber)).size)} />
                  <SummaryCard label="Total" value={formatCents(total)} />
                  <SummaryCard label="Paid" value={formatCents(paid)} tone="positive" />
                  <SummaryCard label="Balance due" value={formatCents(total - paid)} tone="negative" />
                </div>
              )}

              {list.map((b) => {
                const balance = b.totalCents - b.paidCents;
                const profit = b.kind === "SALE" ? saleProfit(b as Sale) : null;
                const linkedSale = b.kind === "PURCHASE" ? (b as Purchase).linkedSale : null;
                const expenses = b.expenseAllocations ?? [];
                const expensesCents = billExpensesCents(b);
                return (
                  <Card key={b.id} className="break-inside-avoid">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-base font-semibold">
                          {b.kind === "SALE" ? "Sale" : "Purchase"} #{formatBillNumber(b.billNumber)}
                          {b.kind === "PURCHASE" && (b as Purchase).group && (
                            <span className="ml-2 rounded-full bg-[#f5a524]/20 px-2 py-0.5 text-xs font-medium text-[#9a6200]">
                              supplier entry · {list.filter((x) => x.billNumber === b.billNumber).length} suppliers on this bill
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-black/60 dark:text-white/60">
                          {formatDate(b.date)} · {b.party?.name ?? (b.kind === "SALE" ? "Cash sale" : "No supplier")}
                          {linkedSale && (
                            <span className="text-brand"> · sold on Sale #{formatBillNumber(linkedSale.billNumber)}</span>
                          )}
                        </p>
                      </div>
                      <a
                        href={`/print/${b.kind === "SALE" ? "sale" : "purchase"}/${b.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm underline underline-offset-4 print:hidden"
                      >
                        Open bill
                      </a>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-xs text-black/50 dark:text-white/50">
                          <tr>
                            <th className="py-1.5 pr-2 font-medium">Item</th>
                            <th className="py-1.5 pr-2 text-right font-medium">Qty</th>
                            <th className="py-1.5 pr-2 text-right font-medium">Rate</th>
                            <th className="py-1.5 pr-2 font-medium">FFA</th>
                            <th className="py-1.5 pr-2 text-right font-medium">Tax</th>
                            <th className="py-1.5 text-right font-medium">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.items.map((l) => {
                            const split = b.kind === "SALE" ? saleLineFfaSplit(l) : null;
                            return (
                              <tr key={l.id} className="border-t border-black/5 dark:border-white/5">
                                <td className="py-1.5 pr-2">{l.item.name}</td>
                                <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                                  {l.quantity} {displayUnit(l.item.unit)}
                                </td>
                                <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                                  {formatCents(l.priceCents)}
                                  {split && split.bonusCents > 0 && (
                                    <span className="block text-xs text-black/45">
                                      {formatCents(split.baseRateCents)} + {formatCents(split.bonusCents)} FFA
                                    </span>
                                  )}
                                </td>
                                <td className="py-1.5 pr-2">{l.ffaGrade ?? "—"}</td>
                                <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                                  {l.taxCents > 0 ? `${l.taxPercent}% · ${formatCents(l.taxCents)}` : "—"}
                                </td>
                                <td className="py-1.5 text-right whitespace-nowrap">
                                  {formatCents(l.lineTotalCents + l.taxCents)}
                                </td>
                              </tr>
                            );
                          })}
                          {b.charges.map((c) => (
                            <tr key={c.id} className="border-t border-black/5 text-black/60 dark:border-white/5 dark:text-white/60">
                              <td className="py-1.5 pr-2" colSpan={5}>
                                + {c.label}
                              </td>
                              <td className="py-1.5 text-right whitespace-nowrap">{formatCents(c.amountCents)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {expenses.length > 0 && (
                      <div className="mt-3 border-t border-black/10 pt-3 text-sm dark:border-white/10">
                        <p className="mb-1 text-xs font-medium text-black/50 uppercase dark:text-white/50">
                          Expenses charged to this bill
                        </p>
                        <ul className="flex flex-col gap-0.5">
                          {expenses.map((a, i) => (
                            <li key={i} className="flex justify-between gap-2">
                              <span className="text-black/70 dark:text-white/70">
                                {formatDate(a.expense.date)} · {a.expense.description}
                              </span>
                              <span>{formatCents(a.amountCents)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-3 grid gap-4 border-t border-black/10 pt-3 text-sm sm:grid-cols-2 dark:border-white/10">
                      <div>
                        <p className="mb-1 text-xs font-medium text-black/50 uppercase dark:text-white/50">
                          Payments
                        </p>
                        {b.payments.length === 0 ? (
                          <p className="text-black/50 dark:text-white/50">No payments yet.</p>
                        ) : (
                          <ul className="flex flex-col gap-0.5">
                            {b.payments.map((p) => (
                              <li key={p.id} className="flex justify-between gap-2">
                                <span className="text-black/70 dark:text-white/70">
                                  {formatDate(p.date)} ·{" "}
                                  {p.source === "ADVANCE" ? "from advance" : accountName(accounts, p.paymentMethod)}
                                </span>
                                <span>{formatCents(p.amountCents)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5 sm:items-end">
                        <div className="flex w-full justify-between gap-6 sm:w-64">
                          <span className="text-black/60 dark:text-white/60">Bill total</span>
                          <span className="font-semibold">{formatCents(b.totalCents)}</span>
                        </div>
                        <div className="flex w-full justify-between gap-6 sm:w-64">
                          <span className="text-black/60 dark:text-white/60">Paid</span>
                          <span>{formatCents(b.paidCents)}</span>
                        </div>
                        <div className="flex w-full justify-between gap-6 sm:w-64">
                          <span className="text-black/60 dark:text-white/60">Balance</span>
                          <span className={balance > 0 ? "font-medium text-[#d03b3b]" : "text-[#0ca30c]"}>
                            {balance > 0 ? formatCents(balance) : "Paid in full"}
                          </span>
                        </div>
                        {b.kind === "PURCHASE" && expensesCents > 0 && (
                          <div className="flex w-full justify-between gap-6 sm:w-64">
                            <span className="text-black/60 dark:text-white/60">Cost incl. expenses</span>
                            <span className="font-medium">{formatCents(b.totalCents + expensesCents)}</span>
                          </div>
                        )}
                        {profit && (
                          <div className="flex w-full justify-between gap-6 sm:w-64">
                            <span className="text-black/60 dark:text-white/60" title={`Cost from ${profit.basis}`}>
                              {profit.profitCents >= 0 ? "Profit" : "Loss"}{" "}
                              <span className="text-xs">({profit.basis})</span>
                            </span>
                            <span className={profit.profitCents >= 0 ? "text-[#0ca30c]" : "text-[#d03b3b]"}>
                              {formatCents(Math.abs(profit.profitCents))}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </>
          )}
        </>
      )}
    </div>
  );
}
