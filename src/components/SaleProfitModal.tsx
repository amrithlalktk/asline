"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { formatBillNumber, formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { displayUnit } from "@/lib/units";
import { togglePurchase } from "@/lib/purchasePick";

type BillLine = { itemId: string; name: string; unit: string; quantity: number; amountCents: number };
type PurchaseSummary = {
  id: string;
  billNumber: number;
  date: string;
  partyName: string;
  groupId: string | null;
  groupNumber: number | null;
  lines: BillLine[];
  itemsCents: number;
  chargesCents: number;
  totalCents: number;
  expensesCents: number;
};
type Data = {
  sale: {
    billNumber: number;
    date: string;
    partyName: string;
    lines: BillLine[];
    charges: { label: string; amountCents: number }[];
    expenses: { description: string; date: string; amountCents: number }[];
    itemsCents: number;
    chargesCents: number;
    totalCents: number;
  };
  linked: PurchaseSummary[];
  candidates: PurchaseSummary[];
};

function qty(n: number) {
  return Number(n.toFixed(2)).toLocaleString();
}

// Profit & loss for one sale from the purchases that actually supplied it:
// tick the purchase bills (any suppliers) whose goods went on this sale,
// and the cost, profit and a sold-vs-bought quantity check update live.
export default function SaleProfitModal({
  saleId,
  onClose,
  onSaved,
}: {
  saleId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/sales/${saleId}/purchases`)
      .then((res) => res.json())
      .then((d: Data) => {
        setData(d);
        setSelected(new Set(d.linked.map((p) => p.id)));
      });
  }, [saleId]);

  const all = useMemo(() => (data ? [...data.linked, ...data.candidates] : []), [data]);
  const chosen = all.filter((p) => selected.has(p.id));

  const revenueCents = data?.sale.totalCents ?? 0;
  const purchaseCostCents = chosen.reduce((sum, p) => sum + p.totalCents, 0);
  // Expenses charged to this sale itself, plus those charged to any of the
  // ticked purchases (e.g. lorry hire to bring the goods in).
  const saleExpensesCents = (data?.sale.expenses ?? []).reduce((sum, e) => sum + e.amountCents, 0);
  const purchaseExpensesCents = chosen.reduce((sum, p) => sum + p.expensesCents, 0);
  const expensesCents = saleExpensesCents + purchaseExpensesCents;
  const costCents = purchaseCostCents + expensesCents;
  const profitCents = revenueCents - costCents;
  const margin = revenueCents > 0 ? (profitCents / revenueCents) * 100 : 0;

  // Cost grouped by supplier — the "which parties did this come from" view.
  const bySupplier = new Map<string, number>();
  for (const p of chosen) bySupplier.set(p.partyName, (bySupplier.get(p.partyName) ?? 0) + p.totalCents);

  // Sold vs bought per item, so a forgotten (or extra) purchase stands out.
  const qtyCheck = (data?.sale.lines ?? []).reduce<
    { itemId: string; name: string; unit: string; sold: number; bought: number }[]
  >((rows, l) => {
    const row = rows.find((r) => r.itemId === l.itemId);
    if (row) row.sold += l.quantity;
    else rows.push({ itemId: l.itemId, name: l.name, unit: l.unit, sold: l.quantity, bought: 0 });
    return rows;
  }, []);
  for (const p of chosen)
    for (const l of p.lines) {
      const row = qtyCheck.find((r) => r.itemId === l.itemId);
      if (row) row.bought += l.quantity;
    }

  const linkedIds = new Set(data?.linked.map((p) => p.id) ?? []);
  const changed =
    selected.size !== linkedIds.size || [...selected].some((id) => !linkedIds.has(id));

  function toggle(id: string) {
    setSelected((prev) => new Set(togglePurchase([...prev], id, all)));
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/sales/${saleId}/purchases`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseIds: [...selected] }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Could not save");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={data ? `Profit & Loss — Sale #${formatBillNumber(data.sale.billNumber)}` : "Profit & Loss"}
      onClose={onClose}
      wide
    >
      {!data ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          <p className="text-black/60 dark:text-white/60">
            {data.sale.partyName} · {formatDate(data.sale.date)} · tick the purchases whose goods
            were sold on this bill.
          </p>

          {/* Result */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-black/[0.03] p-3 dark:bg-white/[0.04]">
              <p className="text-xs text-black/50 dark:text-white/50">Sale value</p>
              <p className="mt-0.5 font-semibold">{formatCents(revenueCents)}</p>
            </div>
            <div className="rounded-lg bg-black/[0.03] p-3 dark:bg-white/[0.04]">
              <p className="text-xs text-black/50 dark:text-white/50">
                Purchase cost ({chosen.length})
              </p>
              <p className="mt-0.5 font-semibold">{formatCents(purchaseCostCents)}</p>
            </div>
            <div className="rounded-lg bg-black/[0.03] p-3 dark:bg-white/[0.04]">
              <p className="text-xs text-black/50 dark:text-white/50">Expenses</p>
              <p className="mt-0.5 font-semibold">{formatCents(expensesCents)}</p>
            </div>
            <div
              className={`rounded-lg p-3 ${profitCents >= 0 ? "bg-[#0ca30c]/10 text-[#0a7d0a]" : "bg-[#d03b3b]/10 text-[#d03b3b]"}`}
            >
              <p className="text-xs opacity-80">{profitCents >= 0 ? "Profit" : "Loss"}</p>
              <p className="mt-0.5 font-semibold">
                {formatCents(Math.abs(profitCents))}
                {chosen.length > 0 && (
                  <span className="ml-1 text-xs font-normal">({margin.toFixed(1)}%)</span>
                )}
              </p>
            </div>
          </div>

          {expensesCents > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-black/50 uppercase dark:text-white/50">
                Expenses charged
              </p>
              <ul className="flex flex-col gap-0.5">
                {data.sale.expenses.map((e, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">
                      {e.description} <span className="text-black/45">· this sale</span>
                    </span>
                    <span>{formatCents(e.amountCents)}</span>
                  </li>
                ))}
                {chosen
                  .filter((p) => p.expensesCents > 0)
                  .map((p) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        Expenses on Purchase #{formatBillNumber(p.billNumber)}{" "}
                        <span className="text-black/45">· {p.partyName}</span>
                      </span>
                      <span>{formatCents(p.expensesCents)}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {chosen.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-black/50 uppercase dark:text-white/50">
                  Cost by supplier
                </p>
                <ul className="flex flex-col gap-0.5">
                  {[...bySupplier].map(([name, cents]) => (
                    <li key={name} className="flex justify-between gap-2">
                      <span className="truncate">{name}</span>
                      <span>{formatCents(cents)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-black/50 uppercase dark:text-white/50">
                  Quantity — sold vs bought
                </p>
                <ul className="flex flex-col gap-0.5">
                  {qtyCheck.map((r) => {
                    const diff = r.bought - r.sold;
                    return (
                      <li key={r.itemId} className="flex justify-between gap-2">
                        <span className="truncate">{r.name}</span>
                        <span className={Math.abs(diff) > 0.001 ? "text-[#b87400]" : ""}>
                          {qty(r.sold)} / {qty(r.bought)} {displayUnit(r.unit)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}

          {/* Purchases to pick from */}
          <div>
            <p className="mb-1 text-xs font-medium text-black/50 uppercase dark:text-white/50">
              Purchases
            </p>
            {all.length === 0 ? (
              <p className="text-black/50 dark:text-white/50">
                No unlinked purchases of these items in the 90 days before this sale.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-lg border border-black/10 dark:border-white/10">
                <table className="w-full">
                  <tbody>
                    {all.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => toggle(p.id)}
                        className={`cursor-pointer border-t border-black/5 first:border-t-0 dark:border-white/5 ${selected.has(p.id) ? "bg-brand/[0.07]" : "hover:bg-black/[0.02]"}`}
                      >
                        <td className="w-8 py-2 pl-3 align-top">
                          <input
                            type="checkbox"
                            checked={selected.has(p.id)}
                            onChange={() => toggle(p.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="accent-[#5b3fd0]"
                          />
                        </td>
                        <td className="py-2 pr-2 align-top">
                          <p className="font-medium">{p.partyName}</p>
                          <p className="text-xs text-black/50 dark:text-white/50">
                            Purchase #{formatBillNumber(p.billNumber)} · {formatDate(p.date)}
                            {p.groupNumber && (
                              <span className="text-[#9a6200]"> · combined bill</span>
                            )}
                          </p>
                        </td>
                        <td className="py-2 pr-2 align-top text-xs text-black/60 dark:text-white/60">
                          {p.lines.map((l, i) => (
                            <span key={i} className="block">
                              {l.name} {qty(l.quantity)} {displayUnit(l.unit)}
                            </span>
                          ))}
                          {p.chargesCents > 0 && (
                            <span className="block">+ charges {formatCents(p.chargesCents)}</span>
                          )}
                          {p.expensesCents > 0 && (
                            <span className="block">+ expenses {formatCents(p.expensesCents)}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right align-top font-medium whitespace-nowrap">
                          {formatCents(p.totalCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-black/45 dark:text-white/45">
            Values exclude tax. Sale value includes its charges; purchase cost includes each
            purchase&apos;s charges. Expenses are those assigned to this sale or the ticked
            purchases on the Expenses page. A purchase can be linked to one sale.
          </p>

          {error && <p className="text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !changed}
              className="rounded-md bg-brand px-3 py-2 font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save links"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
