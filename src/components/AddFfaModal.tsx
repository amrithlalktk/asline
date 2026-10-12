"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { formatBillNumber, formatCents } from "@/lib/money";
import { FFA_GRADES_DISPLAY, billFfaAmountCents, ffaBonusCents, ffaGradeLabel } from "@/lib/ffa";
import type { Sale } from "@/lib/types";

// Grade a sale's FFA lines after the fact — the lab result usually comes in
// days after the bill. Shows each line repriced live (base rate + FFA
// amount) and the new bill total before saving.
export default function AddFfaModal({
  sale,
  onClose,
  onSaved,
}: {
  sale: Sale;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Any line can be graded; items marked "needs FFA" are just the ones the
  // Sales list nags about until they are.
  const gradable = sale.items;
  const [grades, setGrades] = useState<Record<string, string>>(() =>
    Object.fromEntries(gradable.map((l) => [l.id, l.ffaGrade ?? ""]))
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rows = gradable.map((l) => {
    const baseCents = l.priceCents - l.ffaBonusCents;
    const rateCents = baseCents + ffaBonusCents(grades[l.id]);
    const preTaxCents = Math.round(rateCents * l.quantity);
    const newAmountCents = preTaxCents + Math.round((preTaxCents * l.taxPercent) / 100);
    return { line: l, baseCents, rateCents, newAmountCents, oldAmountCents: l.lineTotalCents + l.taxCents };
  });
  const newTotalCents =
    sale.totalCents + rows.reduce((sum, r) => sum + r.newAmountCents - r.oldAmountCents, 0);
  const soldCents = sale.totalCents - billFfaAmountCents(sale.items);
  const changed = rows.some((r) => (r.line.ffaGrade ?? "") !== grades[r.line.id]);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/sales/${sale.id}/ffa`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: rows.map((r) => ({ id: r.line.id, ffaGrade: grades[r.line.id] || null })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save FFA");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`FFA — Bill #${formatBillNumber(sale.billNumber)}`} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-black/60 dark:text-white/60">
          {sale.party?.name ?? "Cash sale"} · FFA-10 adds nothing; each half grade better adds{" "}
          {formatCents(ffaBonusCents("FFA-9.5"))} ({formatCents(ffaBonusCents("FFA-9"))} per whole grade) to the rate.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-black/50 dark:text-white/50">
              <tr>
                <th className="py-1.5 pr-2">Item</th>
                <th className="py-1.5 pr-2 text-right">Qty</th>
                <th className="py-1.5 pr-2 text-right">Base rate</th>
                <th className="py-1.5 pr-2">FFA</th>
                <th className="py-1.5 pr-2 text-right">Rate</th>
                <th className="py-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line.id} className="border-t border-black/5 dark:border-white/5">
                  <td className="py-2 pr-2">{r.line.item.name}</td>
                  <td className="py-2 pr-2 text-right">{r.line.quantity}</td>
                  <td className="py-2 pr-2 text-right whitespace-nowrap">{formatCents(r.baseCents)}</td>
                  <td className="py-2 pr-2">
                    <select
                      value={grades[r.line.id]}
                      onChange={(e) => setGrades((prev) => ({ ...prev, [r.line.id]: e.target.value }))}
                      className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
                    >
                      <option value="">Not graded</option>
                      {FFA_GRADES_DISPLAY.map((grade) => (
                        <option key={grade} value={grade}>
                          {ffaGradeLabel(grade)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2 text-right font-medium whitespace-nowrap">
                    {formatCents(r.rateCents)}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">{formatCents(r.newAmountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-1 rounded-lg bg-black/[0.03] px-3 py-2 text-sm dark:bg-white/[0.04]">
          <div className="flex items-center justify-between text-black/60 dark:text-white/60">
            <span>Sold amount (when billed, before FFA)</span>
            <span>{formatCents(soldCents)}</span>
          </div>
          <div className="flex items-center justify-between text-black/60 dark:text-white/60">
            <span>FFA addition</span>
            <span>+{formatCents(newTotalCents - soldCents)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-black/10 pt-1 dark:border-white/10">
          <span className="text-black/60 dark:text-white/60">Bill total</span>
          <span>
            {newTotalCents !== sale.totalCents && (
              <span className="mr-2 text-black/40 line-through dark:text-white/40">
                {formatCents(sale.totalCents)}
              </span>
            )}
            <span className="font-semibold">{formatCents(newTotalCents)}</span>
          </span>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !changed}
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save FFA"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
