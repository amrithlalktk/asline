"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatBillNumber, formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { displayUnit } from "@/lib/units";
import type { Item } from "@/lib/types";
import { togglePurchase } from "@/lib/purchasePick";

type Candidate = {
  id: string;
  billNumber: number;
  date: string;
  partyName: string;
  groupId: string | null;
  groupNumber: number | null;
  lines: { itemId: string; name: string; unit: string; quantity: number }[];
  chargesCents: number;
  totalCents: number;
  expensesCents: number;
};

function qty(n: number) {
  return Number(n.toFixed(2)).toLocaleString();
}

// Optional part of the sale form: pick the purchase bill(s) this sale is
// against, and see the profit on the deal before saving. Purchases are
// offered when they contain an item on this sale, fall within 90 days
// before / 30 after the sale date, and aren't linked to another sale.
export default function SaleAgainstPurchases({
  saleId,
  date,
  lines,
  items,
  saleValueCents,
  saleExpensesCents,
  selected,
  onChange,
}: {
  saleId?: string;
  date: string;
  lines: { itemId: string; quantity: number }[];
  items: Item[];
  // Pre-tax items + charges, as currently typed in the form.
  saleValueCents: number;
  // Expenses already charged to this sale (editing only).
  saleExpensesCents: number;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(selected.length > 0);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);

  const itemIds = [...new Set(lines.map((l) => l.itemId).filter(Boolean))].sort();
  const itemKey = itemIds.join(",");

  useEffect(() => {
    if (!open || !itemKey) return;
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams({ itemIds: itemKey, date });
    if (saleId) params.set("saleId", saleId);
    fetch(`/api/purchases/linkable?${params}`)
      .then((res) => res.json())
      .then((list: Candidate[]) => {
        if (alive) setCandidates(Array.isArray(list) ? list : []);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, itemKey, date, saleId]);

  const chosen = candidates.filter((c) => selected.includes(c.id));
  const purchaseCostCents = chosen.reduce((s, c) => s + c.totalCents, 0);
  const expensesCents = saleExpensesCents + chosen.reduce((s, c) => s + c.expensesCents, 0);
  const profitCents = saleValueCents - purchaseCostCents - expensesCents;
  const margin = saleValueCents > 0 ? (profitCents / saleValueCents) * 100 : 0;

  // Sold vs bought per item on this sale.
  const qtyRows = itemIds.map((id) => {
    const item = items.find((i) => i.id === id);
    const sold = lines.filter((l) => l.itemId === id).reduce((s, l) => s + l.quantity, 0);
    const bought = chosen
      .flatMap((c) => c.lines)
      .filter((l) => l.itemId === id)
      .reduce((s, l) => s + l.quantity, 0);
    return { id, name: item?.name ?? "Item", unit: item?.unit ?? "", sold, bought };
  });

  function toggle(id: string) {
    onChange(togglePurchase(selected, id, candidates));
  }

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="font-medium">Against purchase bills</span>
        <span className="text-black/50 dark:text-white/50">(optional)</span>
        {selected.length > 0 && (
          <span
            className={`ml-auto text-xs font-medium ${profitCents >= 0 ? "text-[#0a7d0a]" : "text-[#d03b3b]"}`}
          >
            {selected.length} linked · {profitCents >= 0 ? "Profit" : "Loss"}{" "}
            {formatCents(Math.abs(profitCents))}
          </span>
        )}
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-black/10 p-3 text-sm dark:border-white/10">
          {itemIds.length === 0 ? (
            <p className="text-black/50 dark:text-white/50">Choose the sale items first.</p>
          ) : loading && candidates.length === 0 ? (
            <p className="text-black/50 dark:text-white/50">Finding purchases…</p>
          ) : candidates.length === 0 ? (
            <p className="text-black/50 dark:text-white/50">
              No unlinked purchases of these items around this date.
            </p>
          ) : (
            <div className="max-h-60 overflow-y-auto rounded-md border border-black/10 dark:border-white/10">
              <table className="w-full">
                <tbody>
                  {candidates.map((c) => {
                    const on = selected.includes(c.id);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => toggle(c.id)}
                        className={`cursor-pointer border-t border-black/5 first:border-t-0 dark:border-white/5 ${on ? "bg-brand/[0.07]" : "hover:bg-black/[0.02]"}`}
                      >
                        <td className="w-8 py-2 pl-3 align-top">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(c.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="accent-[#5b3fd0]"
                          />
                        </td>
                        <td className="py-2 pr-2 align-top">
                          <p className="font-medium">{c.partyName}</p>
                          <p className="text-xs text-black/50 dark:text-white/50">
                            Purchase #{formatBillNumber(c.billNumber)} · {formatDate(c.date)}
                            {c.groupNumber && (
                              <span className="text-[#9a6200]"> · combined bill</span>
                            )}
                          </p>
                        </td>
                        <td className="py-2 pr-2 align-top text-xs text-black/60 dark:text-white/60">
                          {c.lines.map((l, i) => (
                            <span key={i} className="block">
                              {l.name} {qty(l.quantity)} {displayUnit(l.unit)}
                            </span>
                          ))}
                          {c.expensesCents > 0 && (
                            <span className="block">+ expenses {formatCents(c.expensesCents)}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right align-top font-medium whitespace-nowrap">
                          {formatCents(c.totalCents)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {selected.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-md bg-black/[0.03] p-2 dark:bg-white/[0.04]">
                  <p className="text-xs text-black/50 dark:text-white/50">Sale value</p>
                  <p className="font-semibold">{formatCents(saleValueCents)}</p>
                </div>
                <div className="rounded-md bg-black/[0.03] p-2 dark:bg-white/[0.04]">
                  <p className="text-xs text-black/50 dark:text-white/50">Purchase cost</p>
                  <p className="font-semibold">{formatCents(purchaseCostCents)}</p>
                </div>
                <div className="rounded-md bg-black/[0.03] p-2 dark:bg-white/[0.04]">
                  <p className="text-xs text-black/50 dark:text-white/50">Expenses</p>
                  <p className="font-semibold">{formatCents(expensesCents)}</p>
                </div>
                <div
                  className={`rounded-md p-2 ${profitCents >= 0 ? "bg-[#0ca30c]/10 text-[#0a7d0a]" : "bg-[#d03b3b]/10 text-[#d03b3b]"}`}
                >
                  <p className="text-xs opacity-80">{profitCents >= 0 ? "Profit" : "Loss"}</p>
                  <p className="font-semibold">
                    {formatCents(Math.abs(profitCents))}{" "}
                    <span className="text-xs font-normal">({margin.toFixed(1)}%)</span>
                  </p>
                </div>
              </div>
              <ul className="flex flex-col gap-0.5 text-xs">
                {qtyRows.map((r) => (
                  <li key={r.id} className="flex justify-between">
                    <span className="text-black/60 dark:text-white/60">{r.name} — sold / bought</span>
                    <span className={Math.abs(r.bought - r.sold) > 0.001 ? "text-[#b87400]" : ""}>
                      {qty(r.sold)} / {qty(r.bought)} {displayUnit(r.unit)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="text-xs text-black/45 dark:text-white/45">
            Values exclude tax. Purchase cost includes their charges; expenses are those assigned to
            these bills on the Expenses page.
          </p>
        </div>
      )}
    </div>
  );
}
