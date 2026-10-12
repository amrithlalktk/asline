"use client";

import { useState } from "react";
import { type Category, type Expense, type PaymentMethod } from "@/lib/types";
import AccountOptions from "@/components/AccountOptions";
import { useAccounts } from "@/lib/useAccounts";
import ExpenseBillsPicker, { autoSplit, type PickedBill, type SplitMode } from "@/components/ExpenseBillsPicker";

const inputClass =
  "rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent";

export default function ExpenseForm({
  categories,
  initial,
  onSaved,
  onCancel,
}: {
  categories: Category[];
  initial?: Expense;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const accounts = useAccounts();
  const [date, setDate] = useState(
    initial ? initial.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(
    initial ? (initial.amountCents / 100).toString() : ""
  );
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    initial?.paymentMethod ?? "CASH"
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  // Bills this expense is charged to. An existing split is loaded as
  // "custom" so it's kept exactly as saved unless changed.
  const [bills, setBills] = useState<PickedBill[]>(
    (initial?.allocations ?? []).flatMap((a) => {
      const bill = a.sale ?? a.purchase;
      if (!bill) return [];
      return [
        {
          type: a.sale ? ("SALE" as const) : ("PURCHASE" as const),
          billId: bill.id,
          billNumber: bill.billNumber,
          partyName: bill.party?.name ?? (a.sale ? "Cash sale" : "No supplier"),
          billTotalCents: bill.totalCents,
        },
      ];
    })
  );
  const [splitMode, setSplitMode] = useState<SplitMode>(
    initial?.allocations?.length ? "CUSTOM" : "EQUAL"
  );
  const [customCents, setCustomCents] = useState<Record<string, number>>(
    Object.fromEntries(
      (initial?.allocations ?? []).map((a) => [
        `${a.sale ? "SALE" : "PURCHASE"}:${(a.sale ?? a.purchase)?.id}`,
        a.amountCents,
      ])
    )
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const chosenCategoryId = categoryId || categories[0]?.id;
    if (!chosenCategoryId) {
      setError("Create a category first");
      return;
    }

    const amountCents = Math.round((Number(amount) || 0) * 100);
    const shares =
      splitMode === "CUSTOM"
        ? bills.map((b) => customCents[`${b.type}:${b.billId}`] ?? 0)
        : autoSplit(amountCents, bills, splitMode);
    if (bills.length > 0 && shares.reduce((a, b) => a + b, 0) !== amountCents) {
      setError("The bill shares must add up to the expense amount");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        initial ? `/api/expenses/${initial.id}` : "/api/expenses",
        {
          method: initial ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            description,
            amount: Number(amount),
            categoryId: chosenCategoryId,
            paymentMethod,
            notes: notes || null,
            allocations: bills.map((b, i) => ({
              type: b.type,
              billId: b.billId,
              amountCents: shares[i],
            })),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      onSaved();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="date"
        required
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className={inputClass}
      />
      <input
        required
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className={inputClass}
      />
      <input
        required
        type="number"
        min="0.01"
        step="0.01"
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className={inputClass}
      />
      <select
        required
        value={categoryId || categories[0]?.id || ""}
        onChange={(e) => setCategoryId(e.target.value)}
        className={inputClass}
      >
        {categories.length === 0 && <option value="">No categories yet</option>}
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={paymentMethod}
        onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
        className={inputClass}
      >
        <AccountOptions accounts={accounts} current={paymentMethod} />
      </select>
      <ExpenseBillsPicker
        totalCents={Math.round((Number(amount) || 0) * 100)}
        bills={bills}
        setBills={setBills}
        mode={splitMode}
        setMode={setSplitMode}
        customCents={customCents}
        setCustomCents={setCustomCents}
      />
      <textarea
        placeholder="Notes (optional)"
        value={notes ?? ""}
        onChange={(e) => setNotes(e.target.value)}
        className={inputClass}
        rows={2}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : initial ? "Save changes" : "Add expense"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
