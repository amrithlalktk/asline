"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { formatCents } from "@/lib/money";
import { FFA_GRADES_DISPLAY } from "@/lib/ffa";
import AccountOptions from "@/components/AccountOptions";
import { useAccounts } from "@/lib/useAccounts";
import type { Item, Party } from "@/lib/types";

type Line = { itemId: string; quantity: string; price: string; taxPercent: string; ffaGrade: string };
const emptyLine = (): Line => ({ itemId: "", quantity: "", price: "", taxPercent: "0", ffaGrade: "" });
const cell =
  "w-full rounded border border-black/15 bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-black/20 dark:border-white/15";

function lineCents(l: Line) {
  const pre = Math.round((Number(l.quantity) || 0) * (Number(l.price) || 0) * 100);
  return pre + Math.round((pre * (Number(l.taxPercent) || 0)) / 100);
}

// Adds one more supplier (with their items and payment) to a combined bill
// that's already saved — it joins the same bill number.
export default function AddGroupSupplierForm({
  groupId,
  parties,
  items,
  excludePartyIds,
  onAdded,
  onCancel,
}: {
  groupId: string;
  parties: Party[];
  items: Item[];
  excludePartyIds: string[];
  onAdded: () => void;
  onCancel: () => void;
}) {
  const accounts = useAccounts();
  const suppliers = parties.filter(
    (p) => (p.type === "SUPPLIER" || p.type === "BOTH") && !excludePartyIds.includes(p.id)
  );
  const [partyId, setPartyId] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [paid, setPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const total = lines.reduce((s, l) => s + lineCents(l), 0);
  const update = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const valid = lines.filter((l) => l.itemId && Number(l.quantity) > 0);
    if (!partyId) return setError("Choose a supplier");
    if (valid.length === 0) return setError("Add at least one item");
    setSaving(true);
    try {
      const res = await fetch(`/api/purchase-groups/${groupId}/suppliers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId,
          items: valid.map((l) => ({
            itemId: l.itemId,
            quantity: Number(l.quantity),
            price: Number(l.price) || 0,
            taxPercent: Number(l.taxPercent) || 0,
            ffaGrade: l.ffaGrade || null,
          })),
          paid: Number(paid) || 0,
          paymentMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not add supplier");
        return;
      }
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-lg border border-brand/40 p-3 text-sm">
      <p className="font-medium">Add a supplier to this bill</p>
      <select required value={partyId} onChange={(e) => setPartyId(e.target.value)} className={cell}>
        <option value="">Select supplier</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {suppliers.length === 0 && (
        <p className="text-xs text-black/50">Every supplier is already on this bill — add a new party first.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px]">
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
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="py-0.5 pr-1">
                  <select value={l.itemId} onChange={(e) => update(i, { itemId: e.target.value })} className={cell}>
                    <option value="">Select item</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-0.5 pr-1">
                  <input type="number" min="0.01" step="0.01" value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} className={cell} />
                </td>
                <td className="py-0.5 pr-1">
                  <input type="number" min="0" step="0.01" value={l.price} onChange={(e) => update(i, { price: e.target.value })} className={cell} />
                </td>
                <td className="py-0.5 pr-1">
                  <select value={l.ffaGrade} onChange={(e) => update(i, { ffaGrade: e.target.value })} className={cell}>
                    <option value="">No grade</option>
                    {FFA_GRADES_DISPLAY.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-0.5 pr-1">
                  <input type="number" min="0" max="100" step="0.01" value={l.taxPercent} onChange={(e) => update(i, { taxPercent: e.target.value })} className={cell} />
                </td>
                <td className="py-0.5 text-right whitespace-nowrap">{formatCents(lineCents(l))}</td>
                <td className="py-0.5 pl-1">
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove item" className="text-black/40 hover:text-[#d03b3b]">
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => setLines([...lines, emptyLine()])} className="self-start text-xs underline underline-offset-4">
        + Item
      </button>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
          Paid to supplier now
          <input type="number" min="0" step="0.01" placeholder="0" value={paid} onChange={(e) => setPaid(e.target.value)} className={`${cell} w-28`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
          From account
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={cell}>
            <AccountOptions accounts={accounts} current={paymentMethod} />
          </select>
        </label>
        <span className="ml-auto font-medium">{formatCents(total)}</span>
      </div>
      {error && <p className="text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button disabled={saving} className="rounded-md bg-brand px-3 py-2 font-medium text-white disabled:opacity-50">
          {saving ? "Adding…" : "Add supplier"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15">
          Cancel
        </button>
      </div>
    </form>
  );
}
