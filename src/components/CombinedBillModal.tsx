"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { formatBillNumber, formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { displayUnit } from "@/lib/units";
import { itemAverages } from "@/lib/itemAverages";
import AddGroupSupplierForm from "@/components/AddGroupSupplierForm";
import type { Item, Party } from "@/lib/types";

type GroupPurchase = {
  id: string;
  billNumber: number;
  totalCents: number;
  paidCents: number;
  partyId: string | null;
  party: { name: string } | null;
  items: {
    id: string;
    itemId: string;
    quantity: number;
    priceCents: number;
    lineTotalCents: number;
    item: { name: string; unit: string };
  }[];
  charges: { id: string; label: string; amountCents: number }[];
  linkedSale: { billNumber: number } | null;
  expenseAllocations: { amountCents: number }[];
};
type Group = {
  id: string;
  number: number;
  date: string;
  notes: string | null;
  purchases: GroupPurchase[];
  expenses: { id: string; description: string; amountCents: number }[];
};

// A combined purchase bill at a glance — every supplier's part, what's
// owed to each, and the grand total.
export default function CombinedBillModal({
  groupId,
  canDelete,
  parties,
  items,
  startAdding = false,
  onClose,
  onDeleted,
  onChanged,
}: {
  groupId: string;
  canDelete: boolean;
  parties: Party[];
  items: Item[];
  // Open straight into "Add a supplier".
  startAdding?: boolean;
  onClose: () => void;
  onDeleted: () => void;
  onChanged: () => void;
}) {
  const [group, setGroup] = useState<Group | null>(null);
  const [adding, setAdding] = useState(startAdding);

  const loadGroup = useCallback(async () => {
    const res = await fetch(`/api/purchase-groups/${groupId}`);
    setGroup(await res.json());
  }, [groupId]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  // Renumbers the whole combined bill (every supplier entry with it).
  async function changeNumber() {
    if (!group) return;
    const input = prompt("New bill number", String(group.number));
    if (input === null) return;
    const number = Number(input);
    if (!Number.isInteger(number) || number <= 0) {
      alert("Enter a whole number greater than 0");
      return;
    }
    if (number === group.number) return;
    const res = await fetch(`/api/purchase-groups/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number }),
    });
    if (!res.ok) {
      alert((await res.json()).error ?? "Could not change the bill number");
      return;
    }
    await loadGroup();
    onChanged();
  }

  async function handleDelete() {
    if (!group) return;
    if (!confirm(`Delete Purchase #${formatBillNumber(group.number)} with all ${group.purchases.length} supplier entries in it?`)) return;
    const res = await fetch(`/api/purchase-groups/${groupId}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json();
      alert(d.error ?? "Could not delete");
      return;
    }
    onDeleted();
  }

  const total = group?.purchases.reduce((s, p) => s + p.totalCents, 0) ?? 0;
  const paid = group?.purchases.reduce((s, p) => s + p.paidCents, 0) ?? 0;
  const expensesCents = group?.expenses.reduce((s, e) => s + e.amountCents, 0) ?? 0;
  const averages = itemAverages(
    (group?.purchases ?? []).flatMap((p) =>
      p.items.map((l) => ({
        itemId: l.itemId,
        name: l.item.name,
        unit: l.item.unit,
        quantity: l.quantity,
        lineTotalCents: l.lineTotalCents,
      }))
    ),
    expensesCents
  );

  return (
    <Modal title={group ? `Purchase #${formatBillNumber(group.number)}` : "Purchase bill"} onClose={onClose} wide>
      {!group ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-black/60 dark:text-white/60">
            {formatDate(group.date)} · {group.purchases.length} suppliers
            {group.notes && ` · ${group.notes}`}
            {" · "}
            <button type="button" onClick={changeNumber} className="text-brand underline underline-offset-4">
              Change bill number
            </button>
          </p>
          <div className="flex flex-col gap-2">
            {group.purchases.map((p) => (
              <div key={p.id} className="rounded-lg bg-black/[0.03] p-3 dark:bg-white/[0.04]">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium">{p.party?.name ?? "No supplier"}</p>
                  <p className="font-semibold">{formatCents(p.totalCents)}</p>
                </div>
                {p.linkedSale && (
                  <p className="text-xs text-brand">Sold on Sale #{formatBillNumber(p.linkedSale.billNumber)}</p>
                )}
                <ul className="mt-1 text-xs text-black/70 dark:text-white/70">
                  {p.items.map((l) => (
                    <li key={l.id}>
                      {l.item.name} — {l.quantity} {displayUnit(l.item.unit)} × {formatCents(l.priceCents)}
                    </li>
                  ))}
                  {p.charges.map((c) => (
                    <li key={c.id}>
                      + {c.label} {formatCents(c.amountCents)}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs">
                  {p.expenseAllocations.length > 0 && (
                    <span className="text-black/60 dark:text-white/60">
                      Expenses share{" "}
                      {formatCents(p.expenseAllocations.reduce((s, a) => s + a.amountCents, 0))} ·{" "}
                    </span>
                  )}
                  Paid {formatCents(p.paidCents)} ·{" "}
                  <span className={p.totalCents - p.paidCents > 0 ? "text-[#d03b3b]" : "text-[#0ca30c]"}>
                    {p.totalCents - p.paidCents > 0 ? `${formatCents(p.totalCents - p.paidCents)} due` : "paid in full"}
                  </span>
                </p>
              </div>
            ))}
          </div>
          {adding ? (
            <AddGroupSupplierForm
              groupId={group.id}
              parties={parties}
              items={items}
              excludePartyIds={group.purchases.map((p) => p.partyId).filter((x): x is string => Boolean(x))}
              onAdded={async () => {
                setAdding(false);
                await loadGroup();
                onChanged();
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="self-start rounded-md border border-dashed border-black/25 px-3 py-1.5 text-sm hover:border-brand hover:text-brand dark:border-white/25"
            >
              + Add supplier to this bill
            </button>
          )}

          <div>
            <p className="mb-1 text-xs font-medium text-black/50 uppercase dark:text-white/50">
              Items on this bill
            </p>
            <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-black/50 dark:text-white/50">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Item</th>
                    <th className="px-3 py-1.5 text-right font-medium">Total qty</th>
                    <th className="px-3 py-1.5 text-right font-medium">Amount</th>
                    <th className="px-3 py-1.5 text-right font-medium">Avg price</th>
                    {expensesCents > 0 && (
                      <th className="px-3 py-1.5 text-right font-medium" title="Average price with this bill's expenses shared across items by value">
                        Avg incl. expenses
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {averages.map((a) => (
                    <tr key={a.itemId} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-3 py-1.5">{a.name}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {Number(a.quantity.toFixed(2))} {displayUnit(a.unit)}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatCents(a.amountCents)}</td>
                      <td className="px-3 py-1.5 text-right font-semibold whitespace-nowrap text-brand">
                        {formatCents(a.avgPriceCents)}
                      </td>
                      {expensesCents > 0 && (
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatCents(a.avgLandedCents)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {group.expenses.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-black/50 uppercase dark:text-white/50">
                Expenses
              </p>
              <ul className="flex flex-col gap-0.5">
                {group.expenses.map((e) => (
                  <li key={e.id} className="flex justify-between gap-2">
                    <span>{e.description}</span>
                    <span>{formatCents(e.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-0.5 border-t border-black/10 pt-2 dark:border-white/10">
            <div className="flex justify-between">
              <span>Goods</span>
              <span>{formatCents(total)}</span>
            </div>
            {expensesCents > 0 && (
              <div className="flex justify-between">
                <span>Expenses</span>
                <span>{formatCents(expensesCents)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <span>Combined total</span>
              <span>{formatCents(total + expensesCents)}</span>
            </div>
            <div className="flex justify-between text-black/60 dark:text-white/60">
              <span>Paid to suppliers</span>
              <span>{formatCents(paid)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Due to suppliers</span>
              <span className={total - paid > 0 ? "text-[#d03b3b]" : ""}>{formatCents(total - paid)}</span>
            </div>
          </div>
          <p className="text-xs text-black/45 dark:text-white/45">
            Each supplier&apos;s entry keeps its own balance — edit it or record payments to that
            supplier from its entry in the list (click the bill to show entries).
          </p>
          <div className="flex justify-end gap-2">
            {canDelete && (
              <button type="button" onClick={handleDelete} className="mr-auto text-[#d03b3b] underline underline-offset-4">
                Delete bill
              </button>
            )}
            <a
              href={`/print/purchase-group/${group.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-black/15 px-3 py-2 dark:border-white/15"
            >
              Print
            </a>
            <button type="button" onClick={onClose} className="rounded-md bg-brand px-3 py-2 font-medium text-white">
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
