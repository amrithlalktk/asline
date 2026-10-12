"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { accountName, type PaymentLine, type PaymentMethod } from "@/lib/types";
import AccountOptions from "@/components/AccountOptions";
import { useAccounts } from "@/lib/useAccounts";

const inputClass =
  "rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-transparent";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function PaymentHistory({
  apiBase,
  payments,
  totalCents,
  paidCents,
  onChange,
  canDelete,
}: {
  /** e.g. `/api/sales/${sale.id}` or `/api/purchases/${purchase.id}` */
  apiBase: string;
  payments: PaymentLine[];
  totalCents: number;
  paidCents: number;
  onChange: () => void;
  canDelete: boolean;
}) {

  const accounts = useAccounts();  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const balanceCents = totalCents - paidCents;

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, amount: Number(amount), paymentMethod }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setDate(todayStr());
      setAmount("");
      setPaymentMethod("CASH");
      onChange();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeletePayment(payment: PaymentLine) {
    const receivedCents = payment.amountCents + (payment.excessPartyPayment?.amountCents ?? 0);
    if (!confirm(`Remove the ${formatCents(receivedCents)} payment on ${formatDate(payment.date)}?`))
      return;
    const res = await fetch(`${apiBase}/payments/${payment.id}`, { method: "DELETE" });
    if (res.ok) onChange();
    else {
      const data = await res.json();
      alert(data.error ?? "Could not remove payment");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">Payment history</span>
        <span className={balanceCents > 0 ? "text-[#d03b3b]" : "text-[#0ca30c]"}>
          {balanceCents > 0 ? `${formatCents(balanceCents)} balance` : "Fully paid"}
        </span>
      </div>

      {payments.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {payments.map((p) => {
            const excessCents = p.excessPartyPayment?.amountCents ?? 0;
            const receivedCents = p.amountCents + excessCents;
            return (
            <li key={p.id} className="flex items-center justify-between rounded-md bg-white px-3 py-1.5 dark:bg-white/5">
              <span>
                {/* The full amount actually handed over — when part of it overshot this
                    bill, that's the main figure, with the split explained in brackets,
                    not just the amount that landed on this bill. */}
                {formatCents(receivedCents)} given on {formatDate(p.date)}
                <span className="ml-2 text-xs text-black/50 dark:text-white/50">
                  {accountName(accounts, p.paymentMethod)}
                </span>
                {p.source === "ADVANCE" && (
                  <span className="ml-2 text-xs font-medium text-[#0ca30c]">
                    from advance credit
                  </span>
                )}
                {excessCents > 0 ? (
                  <span className="block text-xs text-black/50 dark:text-white/50">
                    ({formatCents(p.amountCents)} applied to this bill, {formatCents(excessCents)}{" "}
                    added as advance for the next bill)
                  </span>
                ) : (
                  p.notes && (
                    <span className="block text-xs text-black/50 dark:text-white/50">
                      ({p.notes})
                    </span>
                  )
                )}
              </span>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => handleDeletePayment(p)}
                  className="text-black/40 hover:text-[#d03b3b] dark:text-white/40"
                  aria-label="Remove payment"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-black/50 dark:text-white/50">No payments recorded yet.</p>
      )}

      <form onSubmit={handleAddPayment} className="flex flex-wrap items-end gap-2">
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
          <label className="text-xs text-black/60 dark:text-white/60">Amount given</label>
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            placeholder={balanceCents > 0 ? (balanceCents / 100).toString() : "0"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} w-32`}
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
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add payment"}
        </button>
        {error && <p className="w-full text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
