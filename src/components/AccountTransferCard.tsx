"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import Card from "@/components/Card";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import type { Account } from "@/lib/types";

type Transfer = {
  id: string;
  date: string;
  amountCents: number;
  notes: string | null;
  fromAccount: { id: string; name: string; type: "CASH" | "BANK" };
  toAccount: { id: string; name: string; type: "CASH" | "BANK" };
  recordedBy: { name: string };
};
type Mode = "WITHDRAW" | "DEPOSIT" | "TRANSFER";

const input = "rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent";
const MODES: [Mode, string, string][] = [
  ["WITHDRAW", "Withdraw", "Bank → Cash"],
  ["DEPOSIT", "Deposit", "Cash → Bank"],
  ["TRANSFER", "Transfer", "Account → Account"],
];

function kindOf(t: Transfer) {
  if (t.fromAccount.type === "BANK" && t.toAccount.type === "CASH") return "Withdrawal";
  if (t.fromAccount.type === "CASH" && t.toAccount.type === "BANK") return "Deposit";
  return "Transfer";
}

// Move money between your own accounts: withdraw cash from the bank,
// deposit cash into the bank, or transfer between accounts. One balance
// goes down, the other up — the total stays the same.
export default function AccountTransferCard({
  accounts,
  canDelete,
  onChanged,
}: {
  accounts: Account[];
  canDelete: boolean;
  onChanged: () => void;
}) {
  const active = accounts.filter((a) => a.active);
  const cash = active.filter((a) => a.type === "CASH");
  const banks = active.filter((a) => a.type === "BANK");

  const [mode, setMode] = useState<Mode>("WITHDRAW");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [recent, setRecent] = useState<Transfer[]>([]);

  const fromOptions = mode === "WITHDRAW" ? banks : mode === "DEPOSIT" ? cash : active;
  const toOptions = mode === "WITHDRAW" ? cash : mode === "DEPOSIT" ? banks : active.filter((a) => a.id !== fromId);

  // Pick sensible defaults whenever the mode (or the account list) changes.
  useEffect(() => {
    setFromId((cur) => (fromOptions.some((a) => a.id === cur) ? cur : (fromOptions[0]?.id ?? "")));
    setToId((cur) => (toOptions.some((a) => a.id === cur) ? cur : (toOptions[0]?.id ?? "")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, accounts, fromId]);

  const loadRecent = useCallback(async () => {
    const res = await fetch("/api/account-transfers");
    if (res.ok) setRecent(await res.json());
  }, []);
  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);
  const cents = Math.round((Number(amount) || 0) * 100);
  const fromAfter = (from?.balanceCents ?? 0) - cents;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    setSaving(true);
    try {
      const res = await fetch("/api/account-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, fromAccountId: fromId, toAccountId: toId, amount: Number(amount), notes: notes || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      setDone(`${formatCents(cents)} moved from ${from?.name} to ${to?.name}.`);
      setAmount("");
      setNotes("");
      loadRecent();
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function handleUndo(t: Transfer) {
    if (!confirm(`Undo ${formatCents(t.amountCents)} ${t.fromAccount.name} → ${t.toAccount.name}?`)) return;
    const res = await fetch(`/api/account-transfers/${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      alert((await res.json()).error ?? "Could not undo");
      return;
    }
    loadRecent();
    onChanged();
  }

  const missing =
    mode === "WITHDRAW" || mode === "DEPOSIT"
      ? banks.length === 0
        ? "Add a bank account first."
        : cash.length === 0
          ? "No cash account."
          : null
      : active.length < 2
        ? "You need at least two accounts."
        : null;

  return (
    <Card title="Move money — withdraw, deposit or transfer">
      <div className="mb-3 flex flex-wrap gap-2">
        {MODES.map(([m, label, hint]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-lg px-3 py-1.5 text-sm ${mode === m ? "bg-brand text-white" : "bg-black/5 hover:bg-black/10 dark:bg-white/10"}`}
          >
            <span className="font-medium">{label}</span>
            <span className={mode === m ? "text-white/75" : "text-black/50 dark:text-white/50"}> · {hint}</span>
          </button>
        ))}
      </div>

      {missing ? (
        <p className="text-sm text-black/60 dark:text-white/60">{missing}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
              From
              <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={input}>
                {fromOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatCents(a.balanceCents ?? 0)})
                  </option>
                ))}
              </select>
            </label>
            <ArrowRight size={18} className="mb-2.5 text-black/40" />
            <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
              To
              <select value={toId} onChange={(e) => setToId(e.target.value)} className={input}>
                {toOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatCents(a.balanceCents ?? 0)})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
              Amount
              <input type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} w-36`} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
              Date
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={input} />
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-black/60 dark:text-white/60">
              Note (optional)
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. ATM withdrawal, cheque no." className={input} />
            </label>
            <button disabled={saving || !fromId || !toId} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? "Saving…" : MODES.find(([m]) => m === mode)![1]}
            </button>
          </div>

          {cents > 0 && from && to && (
            <p className="text-sm">
              {from.name}: {formatCents(from.balanceCents ?? 0)} →{" "}
              <span className={`font-semibold ${fromAfter < 0 ? "text-[#d03b3b]" : ""}`}>{formatCents(fromAfter)}</span>
              <span className="mx-2 text-black/30">·</span>
              {to.name}: {formatCents(to.balanceCents ?? 0)} →{" "}
              <span className="font-semibold">{formatCents((to.balanceCents ?? 0) + cents)}</span>
              {fromAfter < 0 && <span className="ml-2 text-xs text-[#d03b3b]">({from.name} would go below zero)</span>}
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {done && <p className="text-sm text-[#0ca30c]">{done}</p>}
        </form>
      )}

      {recent.length > 0 && (
        <div className="mt-4 border-t border-black/10 pt-3 dark:border-white/10">
          <p className="mb-1 text-xs font-medium text-black/50 uppercase dark:text-white/50">Recent transfers</p>
          <ul className="flex max-h-64 flex-col overflow-y-auto text-sm">
            {recent.slice(0, 20).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 border-t border-black/5 py-1.5 first:border-t-0 dark:border-white/5">
                <span className="min-w-0">
                  <span className="mr-2 rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">{kindOf(t)}</span>
                  {t.fromAccount.name} → {t.toAccount.name}
                  <span className="text-black/50 dark:text-white/50">
                    {" "}
                    · {formatDate(t.date)}
                    {t.notes && ` · ${t.notes}`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="font-medium">{formatCents(t.amountCents)}</span>
                  {canDelete && (
                    <button onClick={() => handleUndo(t)} className="text-xs text-[#d03b3b] underline underline-offset-4">
                      Undo
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
