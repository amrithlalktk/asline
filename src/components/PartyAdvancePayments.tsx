"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import {
  accountName, type PartyPayment,
  type PartyPaymentDirection,
  type PaymentMethod,
} from "@/lib/types";
import AccountOptions from "@/components/AccountOptions";
import { useAccounts } from "@/lib/useAccounts";

const inputClass =
  "rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-transparent";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Advance payments given/taken with a party outside of any specific
// Sale/Purchase — e.g. a customer prepaying, or prepaying a supplier. Shown
// as an expandable panel under a party row, mirroring PaymentHistory's
// pattern for Sale/Purchase installments.
export default function PartyAdvancePayments({
  partyId,
  availableAdvanceCents,
  availableAdvanceForPurchaseCents,
  onChange,
  canDelete,
}: {
  partyId: string;
  availableAdvanceCents: number;
  availableAdvanceForPurchaseCents: number;
  onChange: () => void;
  canDelete: boolean;
}) {

  const accounts = useAccounts();  const [payments, setPayments] = useState<PartyPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayStr());
  const [direction, setDirection] = useState<PartyPaymentDirection>("RECEIVED");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/parties/${partyId}/payments`);
    setPayments(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId]);

  function openEdit(p: PartyPayment) {
    setEditingId(p.id);
    setDate(p.date.slice(0, 10));
    setDirection(p.direction);
    setAmount((p.amountCents / 100).toString());
    setPaymentMethod(p.paymentMethod);
    setNotes(p.notes ?? "");
  }

  function resetForm() {
    setEditingId(null);
    setDate(todayStr());
    setDirection("RECEIVED");
    setAmount("");
    setPaymentMethod("CASH");
    setNotes("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const url = editingId
        ? `/api/parties/${partyId}/payments/${editingId}`
        : `/api/parties/${partyId}/payments`;
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          direction,
          amount: Number(amount),
          paymentMethod,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      resetForm();
      await load();
      onChange();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(payment: PartyPayment) {
    if (
      !confirm(
        `Remove the ${formatCents(payment.amountCents)} ${
          payment.direction === "RECEIVED" ? "received" : "paid"
        } on ${formatDate(payment.date)}?`
      )
    )
      return;
    const res = await fetch(`/api/parties/${partyId}/payments/${payment.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await load();
      onChange();
    } else {
      const data = await res.json();
      alert(data.error ?? "Could not remove payment");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Advance payments</span>
        <span className="flex flex-col items-end gap-0.5">
          {availableAdvanceCents > 0 && (
            <span className="text-sm text-[#0ca30c]">
              {formatCents(availableAdvanceCents)} available to apply on the next sale
            </span>
          )}
          {availableAdvanceForPurchaseCents > 0 && (
            <span className="text-sm text-[#0ca30c]">
              {formatCents(availableAdvanceForPurchaseCents)} available to apply on the next
              purchase
            </span>
          )}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>
      ) : payments.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {payments.map((p) => (
            <li
              key={p.id}
              className={`flex items-center justify-between rounded-md px-3 py-1.5 ${
                editingId === p.id
                  ? "bg-black/[0.05] dark:bg-white/10"
                  : "bg-white dark:bg-white/5"
              }`}
            >
              <span>
                {formatCents(p.amountCents)} {p.direction === "RECEIVED" ? "received" : "paid"} on{" "}
                {formatDate(p.date)}
                <span className="ml-2 text-xs text-black/50 dark:text-white/50">
                  {accountName(accounts, p.paymentMethod)}
                </span>
                {p.notes && (
                  <span className="block text-xs text-black/50 dark:text-white/50">
                    {p.notes}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
                  aria-label="Edit advance payment"
                >
                  <Pencil size={14} />
                </button>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    className="text-black/40 hover:text-[#d03b3b] dark:text-white/40"
                    aria-label="Remove advance payment"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-black/50 dark:text-white/50">No advance payments yet.</p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Date</label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Direction</label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as PartyPaymentDirection)}
            className={inputClass}
          >
            <option value="RECEIVED">Received from party</option>
            <option value="PAID">Paid to party</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Amount</label>
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} w-28`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Method</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            className={inputClass}
          >
            <AccountOptions accounts={accounts} current={paymentMethod} />
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Notes (optional)</label>
          <input
            placeholder="e.g. against next month's order"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${inputClass} w-56`}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : editingId ? "Save changes" : "Add"}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={resetForm}
            className="rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/15"
          >
            Cancel edit
          </button>
        )}
        {error && <p className="w-full text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
