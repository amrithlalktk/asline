"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import Card from "@/components/Card";
import SummaryCard from "@/components/SummaryCard";
import AccountOptions from "@/components/AccountOptions";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { invalidateAccounts, useAccounts } from "@/lib/useAccounts";
import DateInput from "@/components/DateInput";

type Partner = {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  addedCents: number;
  withdrawnCents: number;
  capitalCents: number;
};
type Entry = {
  id: string;
  type: "CONTRIBUTION" | "WITHDRAWAL";
  date: string;
  amountCents: number;
  notes: string | null;
  partner: { id: string; name: string };
  account: { id: string; name: string };
  recordedBy: { name: string };
};

const input = "rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent";
const today = () => new Date().toISOString().slice(0, 10);

// Partners and the capital each has put into (or taken out of) the
// business. Adding capital raises the chosen account's balance, withdrawing
// lowers it; neither is sales income or an expense.
export default function CapitalPage() {
  const accounts = useAccounts();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [filterPartner, setFilterPartner] = useState("");

  const [type, setType] = useState<"CONTRIBUTION" | "WITHDRAWAL">("CONTRIBUTION");
  const [partnerId, setPartnerId] = useState("");
  const [amount, setAmount] = useState("");
  const [account, setAccount] = useState("CASH");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [partnerError, setPartnerError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, e] = await Promise.all([
      fetch("/api/partners").then((r) => r.json()),
      fetch(`/api/capital${filterPartner ? `?partnerId=${filterPartner}` : ""}`).then((r) => r.json()),
    ]);
    setPartners(p);
    setEntries(e);
  }, [filterPartner]);

  useEffect(() => {
    load();
  }, [load]);

  const activePartners = partners.filter((p) => p.active);
  useEffect(() => {
    if (!activePartners.some((p) => p.id === partnerId)) setPartnerId(activePartners[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partners]);

  async function handleAddPartner(e: React.FormEvent) {
    e.preventDefault();
    setPartnerError(null);
    const res = await fetch("/api/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, phone: newPhone || null }),
    });
    const data = await res.json();
    if (!res.ok) {
      setPartnerError(data.error ?? "Could not add partner");
      return;
    }
    setNewName("");
    setNewPhone("");
    setPartnerId(data.id);
    load();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    setSaving(true);
    try {
      const res = await fetch("/api/capital", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId, type, date, amount: Number(amount), paymentMethod: account, notes: notes || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      const who = partners.find((p) => p.id === partnerId)?.name;
      const where = accounts.find((a) => a.id === account)?.name;
      setDone(
        type === "CONTRIBUTION"
          ? `${formatCents(Math.round(Number(amount) * 100))} capital added by ${who} into ${where}.`
          : `${formatCents(Math.round(Number(amount) * 100))} withdrawn by ${who} from ${where}.`
      );
      setAmount("");
      setNotes("");
      invalidateAccounts();
      load();
    } finally {
      setSaving(false);
    }
  }

  async function patchPartner(p: Partner, body: Record<string, unknown>) {
    const res = await fetch(`/api/partners/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) alert((await res.json()).error ?? "Could not update");
    else load();
  }

  async function renamePartner(p: Partner) {
    const name = prompt("Partner name", p.name);
    if (name === null || !name.trim() || name.trim() === p.name) return;
    const phone = prompt("Phone (optional)", p.phone ?? "");
    patchPartner(p, { name: name.trim(), phone: phone?.trim() || null });
  }

  async function deletePartner(p: Partner) {
    if (!confirm(`Delete partner "${p.name}"?`)) return;
    const res = await fetch(`/api/partners/${p.id}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json()).error ?? "Could not delete");
    else load();
  }

  async function undo(entry: Entry) {
    const verb = entry.type === "CONTRIBUTION" ? "capital added by" : "withdrawal by";
    if (!confirm(`Undo ${formatCents(entry.amountCents)} ${verb} ${entry.partner.name}?`)) return;
    const res = await fetch(`/api/capital/${entry.id}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json()).error ?? "Could not undo");
    else {
      invalidateAccounts();
      load();
    }
  }

  const totalAdded = partners.reduce((s, p) => s + p.addedCents, 0);
  const totalWithdrawn = partners.reduce((s, p) => s + p.withdrawnCents, 0);
  const selectedAccount = accounts.find((a) => a.id === account);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Partners &amp; Capital</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Money partners put into the business or take out of it. It moves the chosen cash/bank
          account and each partner&apos;s capital — it isn&apos;t sales income or an expense.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="Total capital" value={formatCents(totalAdded - totalWithdrawn)} />
        <SummaryCard label="Capital added" value={formatCents(totalAdded)} tone="positive" />
        <SummaryCard label="Capital withdrawn" value={formatCents(totalWithdrawn)} tone="negative" />
      </div>

      <Card title="Add or withdraw capital">
        {activePartners.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">Add a partner below first.</p>
        ) : (
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/5 p-1 sm:w-96 dark:bg-white/10">
              {(
                [
                  ["CONTRIBUTION", "Add capital", ArrowDownLeft],
                  ["WITHDRAWAL", "Withdraw capital", ArrowUpRight],
                ] as const
              ).map(([t, label, Icon]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
                    type === t ? "bg-white font-medium shadow-sm dark:bg-white/20" : "text-black/60 dark:text-white/60"
                  }`}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
                Partner
                <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className={input}>
                  {activePartners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
                Amount
                <input type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} w-36`} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
                {type === "CONTRIBUTION" ? "Into account" : "From account"}
                <select value={account} onChange={(e) => setAccount(e.target.value)} className={input}>
                  <AccountOptions accounts={accounts} current={account} />
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
                Date
                <DateInput required value={date} onChange={(e) => setDate(e.target.value)} className={input} />
              </label>
              <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-black/60 dark:text-white/60">
                Note (optional)
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. cheque no., purpose" className={input} />
              </label>
              <button disabled={saving || !partnerId} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {saving ? "Saving…" : type === "CONTRIBUTION" ? "Add capital" : "Withdraw"}
              </button>
            </div>
            {selectedAccount && Number(amount) > 0 && (
              <p className="text-sm">
                {selectedAccount.name}: {formatCents(selectedAccount.balanceCents ?? 0)} →{" "}
                <span className="font-semibold">
                  {formatCents(
                    (selectedAccount.balanceCents ?? 0) +
                      (type === "CONTRIBUTION" ? 1 : -1) * Math.round(Number(amount) * 100)
                  )}
                </span>
              </p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {done && <p className="text-sm text-[#0ca30c]">{done}</p>}
          </form>
        )}
      </Card>

      <Card title="Partners" className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-black/60 dark:text-white/60">
              <tr>
                <th className="px-4 py-2">Partner</th>
                <th className="px-4 py-2 text-right">Added</th>
                <th className="px-4 py-2 text-right">Withdrawn</th>
                <th className="px-4 py-2 text-right">Capital</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.id} className={`border-t border-black/5 dark:border-white/5 ${p.active ? "" : "opacity-50"}`}>
                  <td className="px-4 py-2">
                    <span className="font-medium">{p.name}</span>
                    {p.phone && <span className="text-black/50 dark:text-white/50"> · {p.phone}</span>}
                    {!p.active && <span className="text-xs text-black/50"> (hidden)</span>}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap text-[#0ca30c]">{formatCents(p.addedCents)}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap text-[#d03b3b]">{formatCents(p.withdrawnCents)}</td>
                  <td className={`px-4 py-2 text-right font-semibold whitespace-nowrap ${p.capitalCents < 0 ? "text-[#d03b3b]" : ""}`}>
                    {formatCents(p.capitalCents)}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={() => setFilterPartner(filterPartner === p.id ? "" : p.id)} className="mr-3 underline underline-offset-4">
                      {filterPartner === p.id ? "All history" : "History"}
                    </button>
                    <button onClick={() => renamePartner(p)} className="mr-3 underline underline-offset-4">
                      Edit
                    </button>
                    <button onClick={() => patchPartner(p, { active: !p.active })} className="mr-3 underline underline-offset-4">
                      {p.active ? "Hide" : "Show"}
                    </button>
                    <button onClick={() => deletePartner(p)} className="text-[#d03b3b] underline underline-offset-4">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-black/10 dark:border-white/10">
                <td colSpan={5} className="px-4 py-3">
                  <form onSubmit={handleAddPartner} className="flex flex-wrap items-center gap-2">
                    <input required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New partner name" className={input} />
                    <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone (optional)" className={input} />
                    <button className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15">Add partner</button>
                    {partnerError && <span className="text-sm text-red-600">{partnerError}</span>}
                  </form>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={filterPartner ? `History — ${partners.find((p) => p.id === filterPartner)?.name ?? ""}` : "Capital history"}>
        {entries.length === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">No capital entries yet.</p>
        ) : (
          <ul className="flex flex-col text-sm">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 border-t border-black/5 py-2 first:border-t-0 dark:border-white/5">
                <span className="min-w-0">
                  <span
                    className={`mr-2 rounded-full px-2 py-0.5 text-xs ${
                      e.type === "CONTRIBUTION" ? "bg-[#0ca30c]/12 text-[#0a7d0a]" : "bg-[#d03b3b]/10 text-[#d03b3b]"
                    }`}
                  >
                    {e.type === "CONTRIBUTION" ? "Added" : "Withdrawn"}
                  </span>
                  <span className="font-medium">{e.partner.name}</span>
                  <span className="text-black/50 dark:text-white/50">
                    {" "}
                    · {e.type === "CONTRIBUTION" ? "into" : "from"} {e.account.name} · {formatDate(e.date)}
                    {e.notes && ` · ${e.notes}`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className={`font-medium ${e.type === "CONTRIBUTION" ? "text-[#0a7d0a]" : "text-[#d03b3b]"}`}>
                    {e.type === "CONTRIBUTION" ? "+" : "−"}
                    {formatCents(e.amountCents)}
                  </span>
                  <button onClick={() => undo(e)} className="text-xs text-[#d03b3b] underline underline-offset-4">
                    Undo
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
