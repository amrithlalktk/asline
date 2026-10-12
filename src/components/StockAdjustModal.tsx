"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { formatDate } from "@/lib/date";
import { displayUnit } from "@/lib/units";
import type { Item } from "@/lib/types";

type Adjustment = {
  id: string;
  date: string;
  quantity: number;
  reason: string | null;
  recordedBy: { name: string };
};

const input = "rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent";
const fmt = (n: number) => Number(n.toFixed(3)).toLocaleString();

// Correct an item's stock without touching its bills: enter the stock you
// actually have (the difference is recorded) or add/remove a quantity.
// Every correction is kept with its date and reason.
export default function StockAdjustModal({
  item,
  canDelete,
  onClose,
  onChanged,
}: {
  item: Item;
  canDelete: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const unit = displayUnit(item.unit);
  const [stock, setStock] = useState(item.currentStockQty);
  const [history, setHistory] = useState<Adjustment[]>([]);
  const [mode, setMode] = useState<"SET" | "CHANGE">("SET");
  const [value, setValue] = useState("");
  const [direction, setDirection] = useState<1 | -1>(-1);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/items/${item.id}/adjustments`);
    const data = await res.json();
    setStock(data.currentStockQty);
    setHistory(data.adjustments);
  }, [item.id]);

  useEffect(() => {
    load();
  }, [load]);

  const n = Number(value);
  const hasValue = value !== "" && Number.isFinite(n);
  const change = !hasValue ? 0 : mode === "SET" ? n - stock : direction * Math.abs(n);
  const newStock = stock + change;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!hasValue || Math.abs(change) < 0.0005) {
      setError(mode === "SET" ? "Enter the stock you actually have" : "Enter a quantity");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/items/${item.id}/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          mode,
          quantity: mode === "SET" ? n : direction * Math.abs(n),
          reason: reason || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      setValue("");
      setReason("");
      await load();
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(a: Adjustment) {
    if (!confirm(`Undo this ${a.quantity > 0 ? "+" : ""}${fmt(a.quantity)} ${unit} adjustment?`)) return;
    const res = await fetch(`/api/items/${item.id}/adjustments/${a.id}`, { method: "DELETE" });
    if (!res.ok) {
      alert((await res.json()).error ?? "Could not undo");
      return;
    }
    await load();
    onChanged();
  }

  return (
    <Modal title={`Adjust stock — ${item.name}`} onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex items-baseline justify-between rounded-lg bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
          <span className="text-black/60 dark:text-white/60">Current stock</span>
          <span className="text-lg font-semibold">
            {fmt(stock)} {unit}
          </span>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/5 p-1 dark:bg-white/10">
            {(
              [
                ["SET", "Set actual stock"],
                ["CHANGE", "Add / remove"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 ${mode === m ? "bg-white font-medium shadow-sm dark:bg-white/20" : "text-black/60 dark:text-white/60"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "SET" ? (
            <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
              Stock you actually have ({unit})
              <input type="number" step="any" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={fmt(stock)} className={input} />
            </label>
          ) : (
            <div className="flex gap-2">
              <select value={direction} onChange={(e) => setDirection(Number(e.target.value) as 1 | -1)} className={input}>
                <option value={-1}>Remove</option>
                <option value={1}>Add</option>
              </select>
              <input type="number" min="0" step="any" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Quantity (${unit})`} className={`${input} flex-1`} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={input} />
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. physical count, moisture loss)" className={input} />
          </div>

          {hasValue && Math.abs(change) >= 0.0005 && (
            <p className="rounded-lg border border-black/10 px-3 py-2 dark:border-white/10">
              Change{" "}
              <span className={`font-semibold ${change < 0 ? "text-[#d03b3b]" : "text-[#0a7d0a]"}`}>
                {change > 0 ? "+" : ""}
                {fmt(change)} {unit}
              </span>{" "}
              → new stock <span className="font-semibold">{fmt(newStock)} {unit}</span>
            </p>
          )}
          {error && <p className="text-red-600">{error}</p>}
          <button disabled={saving} className="rounded-md bg-brand px-3 py-2 font-medium text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save adjustment"}
          </button>
        </form>

        {/* Only the latest correction is shown; earlier ones still count
            towards stock. */}
        {history[0] && (
          <div>
            <p className="mb-1 text-xs font-medium text-black/50 uppercase dark:text-white/50">Last adjustment</p>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className={`font-medium ${history[0].quantity < 0 ? "text-[#d03b3b]" : "text-[#0a7d0a]"}`}>
                  {history[0].quantity > 0 ? "+" : ""}
                  {fmt(history[0].quantity)} {unit}
                </span>{" "}
                <span className="text-black/60 dark:text-white/60">
                  · {formatDate(history[0].date)}
                  {history[0].reason && ` · ${history[0].reason}`} · {history[0].recordedBy.name}
                </span>
              </span>
              {canDelete && (
                <button onClick={() => handleDelete(history[0])} className="shrink-0 text-xs text-[#d03b3b] underline underline-offset-4">
                  Undo
                </button>
              )}
            </div>
          </div>
        )}
        <p className="text-xs text-black/45 dark:text-white/45">
          Stock = opening stock + purchases − sales ± these adjustments. Bills aren&apos;t changed.
        </p>
      </div>
    </Modal>
  );
}
