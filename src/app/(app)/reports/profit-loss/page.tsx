"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/money";
import Card from "@/components/Card";
import { downloadReportCsv, downloadReportPdf } from "@/lib/reportExport";
import { useDefaultDateRange } from "@/lib/reportHelpers";
import type { Item, Sale } from "@/lib/types";
import EmailPdfButton from "@/components/EmailPdfButton";

export default function ProfitLossPage() {
  const { from, to, setFrom, setTo, ready } = useDefaultDateRange();
  const [revenueCents, setRevenueCents] = useState(0);
  const [cogsCents, setCogsCents] = useState(0);
  const [expenseCents, setExpenseCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generatedBy, setGeneratedBy] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((d) => setGeneratedBy(d.name ?? ""));
  }, []);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    const [salesRes, expenseRes, itemsRes] = await Promise.all([
      fetch(`/api/sales?from=${from}&to=${to}&pageSize=1000`).then((r) => r.json()),
      fetch(`/api/reports?from=${from}&to=${to}`).then((r) => r.json()),
      fetch("/api/items").then((r) => r.json()),
    ]);
    const sales = salesRes.sales as Sale[];
    const items = itemsRes as Item[];
    const costByItemId = new Map(items.map((i) => [i.id, i.avgPurchaseCostCents]));
    const revenue = sales.reduce(
      (sum, s) => sum + s.items.reduce((lsum, l) => lsum + l.lineTotalCents, 0),
      0
    );
    const cogs = sales.reduce(
      (sum, s) =>
        sum +
        s.items.reduce((lsum, l) => lsum + (costByItemId.get(l.itemId) ?? 0) * l.quantity, 0),
      0
    );
    setRevenueCents(revenue);
    setCogsCents(cogs);
    setExpenseCents(expenseRes.totalExpenseCents ?? 0);
    setLoading(false);
  }, [from, to, ready]);

  useEffect(() => {
    load();
  }, [load]);

  const grossProfitCents = revenueCents - cogsCents;
  const netProfitCents = grossProfitCents - expenseCents;

  function reportRows() {
    return [
      ["Revenue (sales, excl. tax)", (revenueCents / 100).toFixed(2)],
      ["Cost of goods sold", (-cogsCents / 100).toFixed(2)],
      ["Gross profit", (grossProfitCents / 100).toFixed(2)],
      ["Expenses", (-expenseCents / 100).toFixed(2)],
      ["Net profit", (netProfitCents / 100).toFixed(2)],
    ];
  }

  function handleExport(kind: "csv" | "pdf") {
    const args = {
      filename: `profit_and_loss_${from}_to_${to}.${kind}`,
      title: `Profit & Loss (${from} to ${to})`,
      header: ["Line", "Amount"],
      rows: reportRows(),
      generatedBy,
    };
    if (kind === "csv") downloadReportCsv(args);
    else downloadReportPdf(args);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Profit &amp; Loss</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          A simplified statement — revenue comes from Sales, and cost of goods sold uses each
          item&apos;s average purchase cost to date (not full accrual accounting).
        </p>
      </div>

      <Card className="print:hidden">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </div>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => handleExport("csv")}
              disabled={loading}
              className="rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-40 dark:border-white/15"
            >
              Export CSV
            </button>
            <button
              onClick={() => handleExport("pdf")}
              disabled={loading}
              className="rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-40 dark:border-white/15"
            >
              Export PDF
            </button>
            <EmailPdfButton
              endpoint="/api/reports/email-pdf"
              body={{
                filename: `profit_and_loss_${from}_to_${to}.pdf`,
                title: `Profit & Loss (${from} to ${to})`,
                header: ["Line", "Amount"],
                rows: reportRows(),
              }}
              disabled={loading}
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
        {from} to {to}
      </p>

      <Card>
        <div className="flex flex-col divide-y divide-black/10 text-sm dark:divide-white/10">
          <div className="flex justify-between py-2">
            <span>Revenue (sales, excl. tax)</span>
            <span className="font-medium">{formatCents(revenueCents)}</span>
          </div>
          <div className="flex justify-between py-2 text-black/60 dark:text-white/60">
            <span>Cost of goods sold</span>
            <span>-{formatCents(cogsCents)}</span>
          </div>
          <div className="flex justify-between py-2 font-medium">
            <span>Gross profit</span>
            <span className={grossProfitCents >= 0 ? "text-[#0ca30c]" : "text-[#d03b3b]"}>
              {formatCents(grossProfitCents)}
            </span>
          </div>
          <div className="flex justify-between py-2 text-black/60 dark:text-white/60">
            <span>Expenses</span>
            <span>-{formatCents(expenseCents)}</span>
          </div>
          <div className="flex justify-between py-3 text-base font-semibold">
            <span>Net profit</span>
            <span className={netProfitCents >= 0 ? "text-[#0ca30c]" : "text-[#d03b3b]"}>
              {formatCents(netProfitCents)}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
