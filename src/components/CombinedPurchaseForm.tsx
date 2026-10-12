"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatCents } from "@/lib/money";
import { FFA_GRADES_DISPLAY } from "@/lib/ffa";
import AccountOptions from "@/components/AccountOptions";
import { useAccounts } from "@/lib/useAccounts";
import { autoSplit } from "@/lib/split";
import type { Category, Item, Party } from "@/lib/types";

type Line = { itemId: string; quantity: string; price: string; taxPercent: string; ffaGrade: string };
type ExpenseRow = { description: string; amount: string; categoryId: string; paymentMethod: string };
type SupplierPart = {
  key: number;
  partyId: string;
  lines: Line[];
  paid: string;
  paymentMethod: string;
};

const cell =
  "w-full rounded border border-black/15 bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-black/20 dark:border-white/15";

const emptyLine = (): Line => ({ itemId: "", quantity: "", price: "", taxPercent: "0", ffaGrade: "" });
let nextKey = 1;
const emptyPart = (): SupplierPart => ({
  key: nextKey++,
  partyId: "",
  lines: [emptyLine()],
  paid: "",
  paymentMethod: "CASH",
});

function lineCents(l: Line) {
  const pre = Math.round((Number(l.quantity) || 0) * (Number(l.price) || 0) * 100);
  return pre + Math.round((pre * (Number(l.taxPercent) || 0)) / 100);
}
function partCents(p: SupplierPart) {
  return p.lines.reduce((s, l) => s + lineCents(l), 0);
}
const toCentsNum = (v: string) => Math.round((Number(v) || 0) * 100);

// One purchase bill with goods from several suppliers. Each supplier gets
// its own section (items, what was paid them); on save every section
// becomes that supplier's purchase inside one "Combined #" bill, so each
// supplier's balance and payments stay separate and correct. Costs for the
// whole bill (lorry hire, loading…) go in one Expenses section — each is
// recorded as an expense and split across the suppliers by value.
export default function CombinedPurchaseForm({
  parties,
  items,
  onSaved,
  onCancel,
}: {
  parties: Party[];
  items: Item[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const accounts = useAccounts();
  const suppliers = parties.filter((p) => p.type === "SUPPLIER" || p.type === "BOTH");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [parts, setParts] = useState<SupplierPart[]>([emptyPart(), emptyPart()]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then(setCategories);
  }, []);

  function updateExpense(i: number, patch: Partial<ExpenseRow>) {
    setExpenses((prev) => prev.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  }
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updatePart(key: number, patch: Partial<SupplierPart>) {
    setParts((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }
  function updateLine(part: SupplierPart, i: number, patch: Partial<Line>) {
    updatePart(part.key, { lines: part.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  }
  const goodsCents = parts.reduce((s, p) => s + partCents(p), 0);
  const expensesCents = expenses.reduce((s, e) => s + toCentsNum(e.amount), 0);
  // Preview of how the expenses land on each supplier (same split the
  // server applies: by each supplier's goods value).
  const expenseShares = autoSplit(
    expensesCents,
    parts.map((p) => ({ billTotalCents: partCents(p) })),
    "VALUE"
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = parts.map((p) => ({
      partyId: p.partyId,
      items: p.lines
        .filter((l) => l.itemId && Number(l.quantity) > 0)
        .map((l) => ({
          itemId: l.itemId,
          quantity: Number(l.quantity),
          price: Number(l.price) || 0,
          taxPercent: Number(l.taxPercent) || 0,
          ffaGrade: l.ffaGrade || null,
        })),
      paid: Number(p.paid) || 0,
      paymentMethod: p.paymentMethod,
    }));
    if (payload.some((p) => !p.partyId)) return setError("Choose a supplier for every part");
    if (payload.some((p) => p.items.length === 0)) return setError("Add at least one item for every supplier");
    const ids = payload.map((p) => p.partyId);
    if (new Set(ids).size !== ids.length) return setError("Each supplier should appear once — add their items in one part");
    const expensePayload = expenses
      .filter((e) => e.description.trim() || Number(e.amount) > 0)
      .map((e) => ({
        description: e.description.trim(),
        amount: Number(e.amount) || 0,
        categoryId: e.categoryId || categories[0]?.id || "",
        paymentMethod: e.paymentMethod,
      }));
    if (expensePayload.some((e) => !e.description || e.amount <= 0))
      return setError("Give every expense a description and an amount");

    setSaving(true);
    try {
      const res = await fetch("/api/purchase-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, notes: notes || null, suppliers: payload, expenses: expensePayload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Date</label>
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={cell} />
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Notes (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. lorry KL-11 trip" className={cell} />
        </div>
      </div>

      {parts.map((part, pi) => (
        <div key={part.key} className="rounded-lg border border-black/10 p-3 dark:border-white/10">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
              {pi + 1}
            </span>
            <select
              required
              value={part.partyId}
              onChange={(e) => updatePart(part.key, { partyId: e.target.value })}
              className={`${cell} max-w-xs`}
            >
              <option value="">Select supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="ml-auto text-right font-medium">
              {formatCents(partCents(part))}
              {expenseShares[pi] > 0 && (
                <span className="block text-xs font-normal text-black/50 dark:text-white/50">
                  + {formatCents(expenseShares[pi])} expenses
                </span>
              )}
            </span>
            {parts.length > 1 && (
              <button
                type="button"
                onClick={() => setParts(parts.filter((p) => p.key !== part.key))}
                aria-label="Remove supplier"
                className="rounded p-1 text-black/40 hover:text-[#d03b3b]"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="text-left text-xs text-black/50 dark:text-white/50">
                <tr>
                  <th className="pb-1 font-medium">Item</th>
                  <th className="w-20 pb-1 font-medium">Qty</th>
                  <th className="w-24 pb-1 font-medium">Rate</th>
                  <th className="w-24 pb-1 font-medium">FFA</th>
                  <th className="w-16 pb-1 font-medium">Tax %</th>
                  <th className="w-24 pb-1 text-right font-medium">Amount</th>
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {part.lines.map((l, i) => {
                  const item = items.find((it) => it.id === l.itemId);
                  return (
                    <tr key={i}>
                      <td className="py-0.5 pr-1">
                        <select value={l.itemId} onChange={(e) => updateLine(part, i, { itemId: e.target.value, ffaGrade: "" })} className={cell}>
                          <option value="">Select item</option>
                          {items.map((it) => (
                            <option key={it.id} value={it.id}>
                              {it.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-0.5 pr-1">
                        <input type="number" min="0.01" step="0.01" value={l.quantity} onChange={(e) => updateLine(part, i, { quantity: e.target.value })} className={cell} />
                      </td>
                      <td className="py-0.5 pr-1">
                        <input type="number" min="0" step="0.01" value={l.price} onChange={(e) => updateLine(part, i, { price: e.target.value })} className={cell} />
                      </td>
                      <td className="py-0.5 pr-1">
                        {item ? (
                          <select value={l.ffaGrade} onChange={(e) => updateLine(part, i, { ffaGrade: e.target.value })} className={cell}>
                            <option value="">No grade</option>
                            {FFA_GRADES_DISPLAY.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="block text-center text-black/25">—</span>
                        )}
                      </td>
                      <td className="py-0.5 pr-1">
                        <input type="number" min="0" max="100" step="0.01" value={l.taxPercent} onChange={(e) => updateLine(part, i, { taxPercent: e.target.value })} className={cell} />
                      </td>
                      <td className="py-0.5 text-right whitespace-nowrap">{formatCents(lineCents(l))}</td>
                      <td className="py-0.5 pl-1">
                        {part.lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => updatePart(part.key, { lines: part.lines.filter((_, j) => j !== i) })}
                            aria-label="Remove item"
                            className="text-black/40 hover:text-[#d03b3b]"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-2 flex flex-wrap items-end gap-3">
            <button type="button" onClick={() => updatePart(part.key, { lines: [...part.lines, emptyLine()] })} className="text-xs underline underline-offset-4">
              + Item
            </button>
            <div className="ml-auto flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-black/60 dark:text-white/60">Paid to supplier now</label>
                <input type="number" min="0" step="0.01" placeholder="0" value={part.paid} onChange={(e) => updatePart(part.key, { paid: e.target.value })} className={`${cell} w-28`} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-black/60 dark:text-white/60">From account</label>
                <select value={part.paymentMethod} onChange={(e) => updatePart(part.key, { paymentMethod: e.target.value })} className={cell}>
                  <AccountOptions accounts={accounts} current={part.paymentMethod} />
                </select>
              </div>
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setParts([...parts, emptyPart()])}
        className="flex items-center gap-1 self-start rounded-md border border-dashed border-black/25 px-3 py-1.5 text-sm hover:border-brand hover:text-brand dark:border-white/25"
      >
        <Plus size={15} /> Add supplier
      </button>

      <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <div>
            <p className="font-medium">Expenses</p>
            <p className="text-xs text-black/50 dark:text-white/50">
              For the whole bill — lorry hire, loading, weighbridge… Saved as expenses and split
              across the suppliers by value.
            </p>
          </div>
          {expensesCents > 0 && <span className="font-medium">{formatCents(expensesCents)}</span>}
        </div>
        {expenses.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="text-left text-xs text-black/50 dark:text-white/50">
                <tr>
                  <th className="pb-1 font-medium">Description</th>
                  <th className="w-40 pb-1 font-medium">Category</th>
                  <th className="w-32 pb-1 font-medium">Paid from</th>
                  <th className="w-28 pb-1 text-right font-medium">Amount</th>
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {expenses.map((e, i) => (
                  <tr key={i}>
                    <td className="py-0.5 pr-1">
                      <input placeholder="e.g. Lorry hire" value={e.description} onChange={(ev) => updateExpense(i, { description: ev.target.value })} className={cell} />
                    </td>
                    <td className="py-0.5 pr-1">
                      <select value={e.categoryId || categories[0]?.id || ""} onChange={(ev) => updateExpense(i, { categoryId: ev.target.value })} className={cell}>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-0.5 pr-1">
                      <select value={e.paymentMethod} onChange={(ev) => updateExpense(i, { paymentMethod: ev.target.value })} className={cell}>
                        <AccountOptions accounts={accounts} current={e.paymentMethod} />
                      </select>
                    </td>
                    <td className="py-0.5">
                      <input type="number" min="0.01" step="0.01" value={e.amount} onChange={(ev) => updateExpense(i, { amount: ev.target.value })} className={`${cell} text-right`} />
                    </td>
                    <td className="py-0.5 pl-1">
                      <button type="button" onClick={() => setExpenses(expenses.filter((_, j) => j !== i))} aria-label="Remove expense" className="text-black/40 hover:text-[#d03b3b]">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button
          type="button"
          onClick={() => setExpenses([...expenses, { description: "", amount: "", categoryId: "", paymentMethod: "CASH" }])}
          className="mt-2 text-xs underline underline-offset-4"
        >
          + Expense
        </button>
      </div>

      <div className="flex flex-col gap-0.5 border-t border-black/10 pt-2 dark:border-white/10">
        <div className="flex items-center justify-between font-medium">
          <span>
            Goods · {parts.length} supplier{parts.length === 1 ? "" : "s"}
          </span>
          <span>{formatCents(goodsCents)}</span>
        </div>
        {expensesCents > 0 && (
          <div className="flex items-center justify-between text-black/60 dark:text-white/60">
            <span>Expenses</span>
            <span>{formatCents(expensesCents)}</span>
          </div>
        )}
        <div className="flex items-center justify-between font-semibold">
          <span>Combined total</span>
          <span className="text-base">{formatCents(goodsCents + expensesCents)}</span>
        </div>
      </div>

      {error && <p className="text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button disabled={saving} className="flex-1 rounded-md bg-brand px-3 py-2 font-medium text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save combined bill"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15">
          Close
        </button>
      </div>
    </form>
  );
}
