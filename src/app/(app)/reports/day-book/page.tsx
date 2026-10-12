"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBillNumber, formatCents } from "@/lib/money";
import Card from "@/components/Card";
import SummaryCard from "@/components/SummaryCard";
import { downloadReportCsv, downloadReportPdf } from "@/lib/reportExport";
import { paymentRemarks } from "@/lib/reportHelpers";
import type { Expense, Purchase, Sale } from "@/lib/types";
import BillPreviewModal, { type PreviewBillType } from "@/components/BillPreviewModal";
import EmailPdfButton from "@/components/EmailPdfButton";

type DayRowItem = { name: string; quantity: number; priceCents: number };

type DayRow = {
  type: "Sale" | "Purchase" | "Expense";
  ref: string;
  partyOrCategory: string;
  // Empty for Expense rows — those show `detail` (the description) instead.
  items: DayRowItem[];
  detail: string;
  amountCents: number;
  // Empty for Expense rows — no payments to explain.
  remarks: string;
  // Undefined for Expense rows — no bill to preview.
  bill?: { type: PreviewBillType; id: string };
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

const HEADER = [
  "Type",
  "Reference",
  "Party / Category",
  "Item",
  "Weight",
  "Price",
  "Amount",
  "Remarks",
];
function csvRows(rows: DayRow[]) {
  return rows.map((r) => [
    r.type,
    r.ref,
    r.partyOrCategory,
    r.items.length > 0 ? r.items.map((i) => i.name).join("; ") : r.detail,
    r.items.map((i) => i.quantity).join("; "),
    r.items.map((i) => (i.priceCents / 100).toFixed(2)).join("; "),
    (r.amountCents / 100).toFixed(2),
    r.remarks,
  ]);
}

export default function DayBookPage() {
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedBy, setGeneratedBy] = useState("");
  const [previewBill, setPreviewBill] = useState<{ type: PreviewBillType; id: string } | null>(
    null
  );

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((d) => setGeneratedBy(d.name ?? ""));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [salesRes, purchasesRes, expenseRes] = await Promise.all([
      fetch(`/api/sales?from=${date}&to=${date}&pageSize=1000`).then((r) => r.json()),
      fetch(`/api/purchases?from=${date}&to=${date}&pageSize=1000`).then((r) => r.json()),
      fetch(`/api/reports?from=${date}&to=${date}`).then((r) => r.json()),
    ]);
    const sales = salesRes.sales as Sale[];
    const purchases = purchasesRes.purchases as Purchase[];
    const expenses = (expenseRes.expenses ?? []) as Expense[];

    const combined: DayRow[] = [
      ...sales.map((s): DayRow => ({
        type: "Sale",
        ref: `#${formatBillNumber(s.billNumber)}`,
        partyOrCategory: s.party?.name ?? "Cash sale",
        items: s.items.map((l) => ({
          name: l.item.name,
          quantity: l.quantity,
          priceCents: l.priceCents,
        })),
        detail: "",
        amountCents: s.totalCents,
        remarks: paymentRemarks(s.payments),
        bill: { type: "SALE", id: s.id },
      })),
      ...purchases.map((p): DayRow => ({
        type: "Purchase",
        ref: `#${formatBillNumber(p.billNumber)}`,
        partyOrCategory: p.party?.name ?? "—",
        items: p.items.map((l) => ({
          name: l.item.name,
          quantity: l.quantity,
          priceCents: l.priceCents,
        })),
        detail: "",
        amountCents: p.totalCents,
        remarks: paymentRemarks(p.payments),
        bill: { type: "PURCHASE", id: p.id },
      })),
      ...expenses.map((e): DayRow => ({
        type: "Expense",
        ref: "—",
        partyOrCategory: e.category.name,
        items: [],
        detail: e.description,
        amountCents: e.amountCents,
        remarks: e.notes ?? "",
      })),
    ];

    setRows(combined);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const saleTotal = rows.filter((r) => r.type === "Sale").reduce((s, r) => s + r.amountCents, 0);
  const purchaseTotal = rows
    .filter((r) => r.type === "Purchase")
    .reduce((s, r) => s + r.amountCents, 0);
  const expenseTotal = rows
    .filter((r) => r.type === "Expense")
    .reduce((s, r) => s + r.amountCents, 0);

  function handleExport(kind: "csv" | "pdf") {
    if (rows.length === 0) return;
    const args = {
      filename: `day_book_${date}.${kind}`,
      title: `Day Book — ${date}`,
      header: HEADER,
      rows: csvRows(rows),
      generatedBy,
    };
    if (kind === "csv") downloadReportCsv(args);
    else downloadReportPdf(args);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Day Book</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Every sale, purchase, and expense recorded on a single day.
        </p>
      </div>

      <Card className="print:hidden">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </div>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => handleExport("csv")}
              disabled={rows.length === 0}
              className="rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-40 dark:border-white/15"
            >
              Export CSV
            </button>
            <button
              onClick={() => handleExport("pdf")}
              disabled={rows.length === 0}
              className="rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-40 dark:border-white/15"
            >
              Export PDF
            </button>
            <EmailPdfButton
              endpoint="/api/reports/email-pdf"
              body={{
                filename: `day_book_${date}.pdf`,
                title: `Day Book — ${date}`,
                header: HEADER,
                rows: csvRows(rows),
              }}
              disabled={rows.length === 0}
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
      <p className="hidden text-sm text-black/60 print:block">{date}</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="Sales" value={formatCents(saleTotal)} tone="positive" />
        <SummaryCard label="Purchases" value={formatCents(purchaseTotal)} tone="negative" />
        <SummaryCard label="Expenses" value={formatCents(expenseTotal)} tone="negative" />
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-black/60 dark:text-white/60">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Party / Category</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-center">Weight</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, index) => (
                <tr key={index} className="border-t border-black/5 dark:border-white/5">
                  <td className="px-4 py-3">
                    <span
                      className={
                        r.type === "Sale"
                          ? "text-[#0ca30c]"
                          : r.type === "Purchase"
                            ? "text-[#2a78d6]"
                            : "text-[#d03b3b]"
                      }
                    >
                      {r.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.bill ? (
                      <button
                        type="button"
                        onClick={() => setPreviewBill(r.bill!)}
                        className="underline underline-offset-4 hover:text-black dark:hover:text-white"
                      >
                        {r.ref}
                      </button>
                    ) : (
                      r.ref
                    )}
                  </td>
                  <td className="px-4 py-3">{r.partyOrCategory}</td>
                  {r.items.length > 0 ? (
                    <>
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
                    </>
                  ) : (
                    <td className="px-4 py-3" colSpan={3}>
                      {r.detail}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatCents(r.amountCents)}
                  </td>
                  <td className="px-4 py-3 text-xs text-black/60 dark:text-white/60">
                    {r.remarks}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-black/50 dark:text-white/50">
                    Nothing recorded on this day.
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
