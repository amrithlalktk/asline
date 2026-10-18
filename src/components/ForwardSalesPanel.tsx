"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Card from "@/components/Card";
import EmailPdfButton from "@/components/EmailPdfButton";
import { formatBillNumber, formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { displayUnit } from "@/lib/units";
import type { Item, Party } from "@/lib/types";
import DateInput from "@/components/DateInput";

export type ForwardSale = {
  id: string;
  number: number;
  date: string;
  dueDate: string | null;
  party: { id: string; name: string; email?: string | null };
  item: { id: string; name: string; unit: string };
  quantity: number;
  rateCents: number;
  valueCents: number;
  deliveredQty: number;
  pendingQty: number;
  status: "OPEN" | "COMPLETED" | "CLOSED";
  closed: boolean;
  notes: string | null;
  deliveries: { id: string; quantity: number; lineTotalCents: number; sale: { id: string; billNumber: number; date: string } }[];
};

type Draft = { number: string; date: string; partyId: string; itemId: string; quantity: string; rate: string; dueDate: string; notes: string };
const today = () => new Date().toISOString().slice(0, 10);
const emptyDraft = (): Draft => ({ number: "", date: today(), partyId: "", itemId: "", quantity: "", rate: "", dueDate: "", notes: "" });

const input =
  "rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-transparent";
const qty = (n: number) => Number(n.toFixed(2)).toLocaleString();

const STATUS_STYLE = {
  OPEN: "bg-[#f5a524]/20 text-[#9a6200]",
  COMPLETED: "bg-[#0ca30c]/12 text-[#0a7d0a]",
  CLOSED: "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60",
} as const;
const STATUS_LABEL = { OPEN: "Open", COMPLETED: "Delivered", CLOSED: "Closed" } as const;

// The forward sale as a two-column PDF (terms, progress, each delivery).
function forwardPdf(f: ForwardSale) {
  const unit = displayUnit(f.item.unit);
  const rows: string[][] = [
    ["Party", f.party.name],
    ["Item", f.item.name],
    ["Agreed on", formatDate(f.date)],
    ...(f.dueDate ? [["Due by", formatDate(f.dueDate)]] : []),
    ["Agreed quantity", `${qty(f.quantity)} ${unit}`],
    ["Agreed rate", formatCents(f.rateCents)],
    ["Value", formatCents(f.valueCents)],
    ["Delivered", `${qty(f.deliveredQty)} ${unit}`],
    ["Pending", `${qty(f.pendingQty)} ${unit}`],
    ["Status", STATUS_LABEL[f.status]],
    ...(f.notes ? [["Notes", f.notes]] : []),
    ...f.deliveries.map((d) => [
      `Delivery — Sale #${formatBillNumber(d.sale.billNumber)} (${formatDate(d.sale.date)})`,
      `${qty(d.quantity)} ${unit} · ${formatCents(d.lineTotalCents)}`,
    ]),
  ];
  return {
    filename: `forward_sale_${formatBillNumber(f.number)}.pdf`,
    title: `Forward Sale #${formatBillNumber(f.number)} — ${f.party.name}`,
    header: ["Detail", ""],
    rows,
  };
}

// Forward sales: agree now to sell a quantity to a party at a fixed rate,
// deliver over later sale bills. Each sale of that item to that party is
// counted against the oldest open forward sale, so "pending" goes down as
// goods are delivered.
export default function ForwardSalesPanel({
  parties,
  items,
  canDelete,
  onChanged,
}: {
  parties: Party[];
  items: Item[];
  canDelete: boolean;
  onChanged: () => void;
}) {
  const customers = parties.filter((p) => p.type === "CUSTOMER" || p.type === "BOTH");
  const [list, setList] = useState<ForwardSale[]>([]);
  const [filter, setFilter] = useState<"" | "OPEN" | "COMPLETED" | "CLOSED">("OPEN");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/forward-sales${filter ? `?status=${filter}` : ""}`);
    setList(await res.json());
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    await load();
    onChanged();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(editingId ? `/api/forward-sales/${editingId}` : "/api/forward-sales", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: draft.date,
          partyId: draft.partyId,
          itemId: draft.itemId,
          quantity: Number(draft.quantity),
          rate: Number(draft.rate) || 0,
          dueDate: draft.dueDate || null,
          notes: draft.notes || null,
          ...(draft.number.trim() ? { number: Number(draft.number) } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      setDraft(emptyDraft());
      setEditingId(null);
      refresh();
    } finally {
      setSaving(false);
    }
  }

  function startEdit(f: ForwardSale) {
    setEditingId(f.id);
    setError(null);
    setDraft({
      number: String(f.number),
      date: f.date.slice(0, 10),
      partyId: f.party.id,
      itemId: f.item.id,
      quantity: String(f.quantity),
      rate: (f.rateCents / 100).toString(),
      dueDate: f.dueDate ? f.dueDate.slice(0, 10) : "",
      notes: f.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function setClosed(f: ForwardSale, closed: boolean) {
    const res = await fetch(`/api/forward-sales/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closed }),
    });
    if (!res.ok) alert((await res.json()).error ?? "Could not update");
    else refresh();
  }

  async function handleDelete(f: ForwardSale) {
    if (!confirm(`Delete Fwd #${formatBillNumber(f.number)}? Its delivered sales stay, just no longer counted against it.`)) return;
    const res = await fetch(`/api/forward-sales/${f.id}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json()).error ?? "Could not delete");
    else refresh();
  }

  const draftValue = Math.round((Number(draft.quantity) || 0) * (Number(draft.rate) || 0) * 100);
  const pendingValue = list
    .filter((f) => f.status === "OPEN")
    .reduce((s, f) => s + Math.round(f.pendingQty * f.rateCents), 0);

  return (
    <div className="flex flex-col gap-4">
      <Card title={editingId ? "Edit forward sale" : "New forward sale"}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
            <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
              Fwd #{!editingId && <span className="text-black/40"> (blank = next)</span>}
              <input
                type="number"
                min="1"
                step="1"
                required={Boolean(editingId)}
                placeholder={editingId ? undefined : "Auto"}
                value={draft.number}
                onChange={(e) => setDraft({ ...draft, number: e.target.value })}
                className={input}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
              Date
              <DateInput required value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={input} />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
              Party
              <select required value={draft.partyId} onChange={(e) => setDraft({ ...draft, partyId: e.target.value })} className={input}>
                <option value="">Select party</option>
                {customers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
              Item
              <select required value={draft.itemId} onChange={(e) => setDraft({ ...draft, itemId: e.target.value })} className={input}>
                <option value="">Select item</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
              Due by (optional)
              <DateInput value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
              Quantity
              <input type="number" required min="0.01" step="0.01" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
              Agreed rate
              <input type="number" required min="0" step="0.01" value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} className={input} />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-black/60 dark:text-white/60 md:col-span-3">
              Notes (optional)
              <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={input} />
            </label>
            <div className="flex flex-col justify-end text-right text-sm">
              <span className="text-xs text-black/50 dark:text-white/50">Value</span>
              <span className="font-semibold">{formatCents(draftValue)}</span>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button disabled={saving} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Saving…" : editingId ? "Save changes" : "Add forward sale"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setDraft(emptyDraft());
                }}
                className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["OPEN", "Open"],
            ["COMPLETED", "Delivered"],
            ["CLOSED", "Closed"],
            ["", "All"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={label}
            onClick={() => setFilter(v)}
            className={`rounded-full px-3 py-1 text-sm ${filter === v ? "bg-brand text-white" : "bg-black/5 hover:bg-black/10 dark:bg-white/10"}`}
          >
            {label}
          </button>
        ))}
        {filter === "OPEN" && list.length > 0 && (
          <span className="ml-auto text-sm text-black/60 dark:text-white/60">
            Pending value <span className="font-semibold text-black dark:text-white">{formatCents(pendingValue)}</span>
          </span>
        )}
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-black/60 dark:text-white/60">
              <tr>
                <th className="px-4 py-3">Fwd #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Party</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Agreed</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="w-56 px-4 py-3">Delivered / pending</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((f) => {
                const pct = f.quantity > 0 ? Math.min(100, (f.deliveredQty / f.quantity) * 100) : 0;
                const overdue = f.status === "OPEN" && f.dueDate && new Date(f.dueDate) < new Date(today());
                return (
                  <Fragment key={f.id}>
                    <tr className="border-t border-black/5 dark:border-white/5">
                      <td className="px-4 py-3 whitespace-nowrap text-black/50">#{formatBillNumber(f.number)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDate(f.date)}
                        {f.dueDate && (
                          <span className={`block text-xs ${overdue ? "text-[#d03b3b]" : "text-black/45 dark:text-white/45"}`}>
                            due {formatDate(f.dueDate)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{f.party.name}</td>
                      <td className="px-4 py-3">
                        {f.item.name}
                        {f.notes && <span className="block text-xs text-black/45 dark:text-white/45">{f.notes}</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {qty(f.quantity)} {displayUnit(f.item.unit)}
                        <span className="block text-xs text-black/45 dark:text-white/45">{formatCents(f.valueCents)}</span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{formatCents(f.rateCents)}</td>
                      <td className="px-4 py-3">
                        <div className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1 text-xs whitespace-nowrap">
                          {qty(f.deliveredQty)} delivered ·{" "}
                          <span className={f.pendingQty > 0 ? "font-semibold" : ""}>{qty(f.pendingQty)} pending</span>
                          {f.deliveredQty > f.quantity + 0.0001 && (
                            <span className="text-[#d03b3b]"> · over by {qty(f.deliveredQty - f.quantity)}</span>
                          )}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[f.status]}`}>
                          {STATUS_LABEL[f.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => setOpenId(openId === f.id ? null : f.id)} className="mr-2 underline underline-offset-4">
                          Deliveries ({f.deliveries.length})
                        </button>
                        <EmailPdfButton
                          endpoint="/api/reports/email-pdf"
                          body={forwardPdf(f)}
                          defaultRecipient={f.party.email ? { name: f.party.name, email: f.party.email } : null}
                          label="Email"
                          className="mr-2 underline underline-offset-4"
                        />
                        <button onClick={() => startEdit(f)} className="mr-2 underline underline-offset-4">
                          Edit
                        </button>
                        <button onClick={() => setClosed(f, !f.closed)} className="mr-2 underline underline-offset-4">
                          {f.closed ? "Reopen" : "Close"}
                        </button>
                        {canDelete && (
                          <button onClick={() => handleDelete(f)} className="text-[#d03b3b] underline underline-offset-4">
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                    {openId === f.id && (
                      <tr className="border-t border-black/5 bg-black/[0.02] dark:border-white/5">
                        <td colSpan={9} className="px-4 py-3">
                          {f.deliveries.length === 0 ? (
                            <p className="text-black/50">
                              No deliveries yet — sell {f.item.name} to {f.party.name} on the Sales tab and it&apos;s
                              counted here.
                            </p>
                          ) : (
                            <ul className="flex flex-col gap-1">
                              {f.deliveries.map((d) => (
                                <li key={d.id} className="flex justify-between gap-4">
                                  <span>
                                    Sale #{formatBillNumber(d.sale.billNumber)} · {formatDate(d.sale.date)}
                                  </span>
                                  <span>
                                    {qty(d.quantity)} {displayUnit(f.item.unit)} · {formatCents(d.lineTotalCents)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-black/50 dark:text-white/50">
                    No {filter ? STATUS_LABEL[filter].toLowerCase() : ""} forward sales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
