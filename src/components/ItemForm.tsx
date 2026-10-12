"use client";

import { useState } from "react";
import type { Item } from "@/lib/types";

const inputClass =
  "rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent";

export default function ItemForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Item;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "pcs");
  const [openingStockQty, setOpeningStockQty] = useState(
    initial ? String(initial.openingStockQty) : "0"
  );
  const [lowStockThreshold, setLowStockThreshold] = useState(
    initial?.lowStockThreshold != null ? String(initial.lowStockThreshold) : ""
  );
  const [ffaGraded, setFfaGraded] = useState(initial?.ffaGraded ?? false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(initial ? `/api/items/${initial.id}` : "/api/items", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          unit,
          openingStockQty: Number(openingStockQty || 0),
          lowStockThreshold: lowStockThreshold ? Number(lowStockThreshold) : null,
          ffaGraded,
        }),
      });
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
        required
        placeholder="Item name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={inputClass}
      />
      <input
        required
        placeholder="Unit (e.g. pcs, kg)"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        className={inputClass}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Opening stock</label>
          <input
            type="number"
            min="0"
            step="1"
            value={openingStockQty}
            onChange={(e) => setOpeningStockQty(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Low stock alert</label>
          <input
            type="number"
            min="0"
            step="1"
            placeholder="Optional"
            value={lowStockThreshold}
            onChange={(e) => setLowStockThreshold(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={ffaGraded}
          onChange={(e) => setFfaGraded(e.target.checked)}
        />
        Usually FFA graded — remind me with “+ Add FFA” until a grade is set
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : initial ? "Save changes" : "Add item"}
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
