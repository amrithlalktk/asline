"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBillNumber, formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { accountName, isAdminRole, type CombinedPayment, type Party } from "@/lib/types";
import { useViewerRole } from "@/lib/useViewerRole";
import Card from "@/components/Card";
import RecordPaymentForm, { type PayType } from "@/components/RecordPaymentForm";
import BillPreviewModal, { type PreviewBillType } from "@/components/BillPreviewModal";
import { useAccounts } from "@/lib/useAccounts";
import DateInput from "@/components/DateInput";

const inputClass =
  "rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-transparent";

const kindLabel: Record<PayType, string> = {
  SALE: "Sale",
  PURCHASE: "Purchase",
  ADVANCE: "Advance",
};

// Credit = money in (a customer paying us, or an advance we received).
// Debit = money out (paying a supplier, or an advance we gave). Matches
// standard ledger convention rather than a single signed "Amount" column.
function isCredit(p: CombinedPayment) {
  return p.kind === "SALE" || (p.kind === "ADVANCE" && p.direction === "RECEIVED");
}

export default function PaymentsPage() {
  const accounts = useAccounts();
  const viewerRole = useViewerRole();
  const canDelete = viewerRole !== null && isAdminRole(viewerRole);

  const [parties, setParties] = useState<Party[]>([]);
  const [editingPayment, setEditingPayment] = useState<CombinedPayment | null>(null);

  const [payments, setPayments] = useState<CombinedPayment[]>([]);
  const [filterType, setFilterType] = useState<PayType | "">("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [previewBill, setPreviewBill] = useState<{ type: PreviewBillType; id: string } | null>(
    null
  );

  useEffect(() => {
    fetch("/api/parties")
      .then((res) => res.json())
      .then(setParties);
  }, []);

  const loadHistory = useCallback(async () => {
    const params = new URLSearchParams({ page: String(historyPage) });
    if (filterType) params.set("type", filterType);
    if (filterFrom) params.set("from", filterFrom);
    if (filterTo) params.set("to", filterTo);
    const res = await fetch(`/api/payments?${params.toString()}`);
    const data = await res.json();
    setPayments(data.payments);
    setTotalPages(data.totalPages);
  }, [historyPage, filterType, filterFrom, filterTo]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  function handleSaved() {
    setEditingPayment(null);
    setHistoryPage(1);
    loadHistory();
  }

  async function handleDeletePayment(p: CombinedPayment) {
    if (!confirm("Remove this payment? This can't be undone.")) return;
    const url =
      p.kind === "SALE"
        ? `/api/sales/${p.refId}/payments/${p.id}`
        : p.kind === "PURCHASE"
          ? `/api/purchases/${p.refId}/payments/${p.id}`
          : `/api/parties/${p.refId}/payments/${p.id}`;
    const res = await fetch(url, { method: "DELETE" });
    if (res.ok) {
      loadHistory();
    } else {
      const data = await res.json();
      alert(data.error ?? "Could not remove payment");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Payments</h1>

      <Card title={editingPayment ? "Editing advance payment" : "Record a payment"}>
        <RecordPaymentForm
          parties={parties}
          editingPayment={editingPayment}
          onCancelEdit={() => setEditingPayment(null)}
          onSaved={handleSaved}
        />
      </Card>

      <Card title="All payments" className="p-0">
        <div className="flex flex-wrap items-end gap-2 p-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Type</label>
            <select
              value={filterType}
              onChange={(e) => {
                setHistoryPage(1);
                setFilterType(e.target.value as PayType | "");
              }}
              className={inputClass}
            >
              <option value="">All</option>
              <option value="SALE">Sale</option>
              <option value="PURCHASE">Purchase</option>
              <option value="ADVANCE">Advance</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">From</label>
            <DateInput
              value={filterFrom}
              onChange={(e) => {
                setHistoryPage(1);
                setFilterFrom(e.target.value);
              }}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">To</label>
            <DateInput
              value={filterTo}
              onChange={(e) => {
                setHistoryPage(1);
                setFilterTo(e.target.value);
              }}
              className={inputClass}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-black/60 dark:text-white/60">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Party</th>
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2 text-right">Debit</th>
                <th className="px-4 py-2 text-right">Credit</th>
                <th className="px-4 py-2">Method</th>
                <th className="px-4 py-2">Notes</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const credit = isCredit(p);
                return (
                  <tr key={`${p.kind}-${p.id}`} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-4 py-2 whitespace-nowrap">{formatDate(p.date)}</td>
                    <td className="px-4 py-2">{kindLabel[p.kind]}</td>
                    <td className="px-4 py-2">{p.partyName}</td>
                    <td className="px-4 py-2">
                      {p.kind === "ADVANCE" ? (
                        p.direction === "RECEIVED" ? (
                          "Advance received"
                        ) : (
                          "Advance paid"
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewBill({ type: p.kind as PreviewBillType, id: p.refId })
                          }
                          className="underline underline-offset-4 hover:text-black dark:hover:text-white"
                        >
                          Bill #{formatBillNumber(p.billNumber ?? 0)}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap text-[#d03b3b]">
                      {credit ? "—" : formatCents(p.amountCents)}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap text-[#0ca30c]">
                      {credit ? formatCents(p.amountCents) : "—"}
                    </td>
                    <td className="px-4 py-2">{accountName(accounts, p.paymentMethod)}</td>
                    <td className="px-4 py-2 text-black/60 dark:text-white/60">{p.notes ?? ""}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {p.kind === "ADVANCE" && (
                        <button
                          onClick={() => setEditingPayment(p)}
                          className="mr-2 underline underline-offset-4"
                        >
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDeletePayment(p)}
                          className="text-[#d03b3b] underline underline-offset-4"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-black/50 dark:text-white/50">
                    No payments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 p-4 text-sm">
            <button
              disabled={historyPage <= 1}
              onClick={() => setHistoryPage((p) => p - 1)}
              className="rounded-md border border-black/15 px-2 py-1 disabled:opacity-40 dark:border-white/15"
            >
              Previous
            </button>
            <span>
              Page {historyPage} of {totalPages}
            </span>
            <button
              disabled={historyPage >= totalPages}
              onClick={() => setHistoryPage((p) => p + 1)}
              className="rounded-md border border-black/15 px-2 py-1 disabled:opacity-40 dark:border-white/15"
            >
              Next
            </button>
          </div>
        )}
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
