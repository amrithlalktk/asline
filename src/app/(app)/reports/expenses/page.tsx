"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import SummaryCard from "@/components/SummaryCard";
import Card from "@/components/Card";
import SearchInput from "@/components/SearchInput";
import CategoryBreakdownChart from "@/components/CategoryBreakdownChart";
import { downloadReportCsv, downloadReportPdf } from "@/lib/reportExport";
import { EXPENSE_HEADER, expenseBillsLabel, expenseRows, useDefaultDateRange } from "@/lib/reportHelpers";
import { accountName, type Category, type Expense, type PaymentMethod } from "@/lib/types";
import EmailPdfButton from "@/components/EmailPdfButton";
import AccountOptions from "@/components/AccountOptions";
import { useAccounts } from "@/lib/useAccounts";
import DateInput from "@/components/DateInput";

type ReportData = {
  totalExpenseCents: number;
  byCategory: { categoryId: string; name: string; totalCents: number }[];
  expenses: Expense[];
};

export default function ExpenseReportPage() {
  const { from, to, setFrom, setTo, ready } = useDefaultDateRange();

  const accounts = useAccounts();  const [categoryId, setCategoryId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatedBy, setGeneratedBy] = useState("");

  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then(setCategories);
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((d) => setGeneratedBy(d.name ?? ""));
  }, []);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    const params = new URLSearchParams({ from, to });
    if (categoryId) params.set("categoryId", categoryId);
    if (paymentMethod) params.set("paymentMethod", paymentMethod);
    if (search.trim()) params.set("q", search.trim());
    const res = await fetch(`/api/reports?${params.toString()}`);
    setData(await res.json());
    setLoading(false);
  }, [from, to, categoryId, paymentMethod, search, ready]);

  useEffect(() => {
    load();
  }, [load]);

  function handleExportCsv() {
    if (!data) return;
    downloadReportCsv({
      filename: `expenses_${from}_to_${to}.csv`,
      title: `Expense report (${formatDate(from)} to ${formatDate(to)})`,
      header: EXPENSE_HEADER,
      rows: expenseRows(data.expenses, accounts),
      generatedBy,
    });
  }

  function handleExportPdf() {
    if (!data) return;
    downloadReportPdf({
      filename: `expenses_${from}_to_${to}.pdf`,
      title: `Expense report (${formatDate(from)} to ${formatDate(to)})`,
      header: EXPENSE_HEADER,
      rows: expenseRows(data.expenses, accounts),
      generatedBy,
    });
  }

  const hasExtraFilters = Boolean(categoryId || paymentMethod || search);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Expenses</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Filter by date, category, or payment method and export as CSV/PDF.
        </p>
      </div>

      <Card className="print:hidden">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">From</label>
            <DateInput
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">To</label>
            <DateInput
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="bg-transparent py-1 text-sm focus:outline-none"
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Payment method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | "")}
              className="bg-transparent py-1 text-sm focus:outline-none"
            >
              <option value="">All</option>
              <AccountOptions accounts={accounts} current={paymentMethod} />
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Search</label>
            <SearchInput value={search} onChange={setSearch} placeholder="Description…" />
          </div>
          {hasExtraFilters && (
            <button
              onClick={() => {
                setCategoryId("");
                setPaymentMethod("");
                setSearch("");
              }}
              className="text-sm underline underline-offset-4"
            >
              Clear filters
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              onClick={handleExportCsv}
              disabled={!data || data.expenses.length === 0}
              className="rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-40 dark:border-white/15"
            >
              Export CSV
            </button>
            <button
              onClick={handleExportPdf}
              disabled={!data || data.expenses.length === 0}
              className="rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-40 dark:border-white/15"
            >
              Export PDF
            </button>
            <EmailPdfButton
              endpoint="/api/reports/email-pdf"
              body={
                data && {
                  filename: `expenses_${from}_to_${to}.pdf`,
                  title: `Expense report (${formatDate(from)} to ${formatDate(to)})`,
                  header: EXPENSE_HEADER,
                  rows: expenseRows(data.expenses, accounts),
                }
              }
              disabled={!data || data.expenses.length === 0}
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

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryCard label="Total expenses" value={formatCents(data.totalExpenseCents)} tone="negative" />
          </div>

          <Card title="Totals by category">
            {data.byCategory.length > 0 ? (
              <CategoryBreakdownChart
                data={data.byCategory.map((c) => ({ name: c.name, totalCents: c.totalCents }))}
              />
            ) : (
              <p className="text-sm text-black/50 dark:text-white/50">
                No expenses match these filters.
              </p>
            )}
          </Card>

          <Card title={`Expenses in range (${data.expenses.length})`} className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-black/60 dark:text-white/60">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">For bills</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.expenses.map((e) => (
                    <tr key={e.id} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(e.date)}</td>
                      <td className="px-4 py-3">{e.description}</td>
                      <td className="px-4 py-3">{e.category.name}</td>
                      <td className="px-4 py-3">{e.paymentMethod ? accountName(accounts, e.paymentMethod) : "—"}</td>
                      <td className="px-4 py-3 text-xs text-black/60 dark:text-white/60">{expenseBillsLabel(e) || "—"}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap text-[#d03b3b]">
                        -{formatCents(e.amountCents)}
                      </td>
                    </tr>
                  ))}
                  {data.expenses.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-black/50 dark:text-white/50">
                        No expenses match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
      {loading && !data && <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>}
    </div>
  );
}
