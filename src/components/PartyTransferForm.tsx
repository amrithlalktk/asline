"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { formatCents } from "@/lib/money";
import type { Party } from "@/lib/types";
import DateInput from "@/components/DateInput";

const inputClass =
  "rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-transparent";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// What a party's balance means to the business, for the hint under each pick.
function balanceHint(party: Party | undefined) {
  if (!party) return null;
  if (party.balanceCents > 0) return <span className="text-[#0ca30c]">Owes you {formatCents(party.balanceCents)}</span>;
  if (party.balanceCents < 0) return <span className="text-[#d03b3b]">You owe {formatCents(-party.balanceCents)}</span>;
  return <span className="text-black/45 dark:text-white/45">Settled</span>;
}

// A party's balance after the transfer, in words.
function afterText(party: Party, changeCents: number) {
  const cents = party.balanceCents + changeCents;
  if (cents > 0) return `${party.name} will owe you ${formatCents(cents)}`;
  if (cents < 0) return `you'll owe ${party.name} ${formatCents(-cents)}`;
  return `${party.name} will be settled`;
}

// One party paying another on the business's behalf — e.g. X owes you
// ₹10,000, you owe Y ₹5,000, so X pays Y ₹5,000 directly. Lowers what X
// owes you and what you owe Y; no cash or bank balance changes.
export default function PartyTransferForm({ parties, onSaved }: { parties: Party[]; onSaved: () => void }) {
  const [date, setDate] = useState(todayStr());
  const [fromPartyId, setFromPartyId] = useState("");
  const [toPartyId, setToPartyId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...parties].sort((a, b) => a.name.localeCompare(b.name));
  const from = parties.find((p) => p.id === fromPartyId);
  const to = parties.find((p) => p.id === toPartyId);
  const amountNum = Number(amount) || 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fromPartyId || !toPartyId) return setError("Choose both parties");
    if (fromPartyId === toPartyId) return setError("Pick two different parties");
    if (amountNum <= 0) return setError("Enter an amount");
    setSaving(true);
    try {
      const res = await fetch("/api/party-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, fromPartyId, toPartyId, amount: amountNum, notes: notes || null }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Could not save");
      setFromPartyId("");
      setToPartyId("");
      setAmount("");
      setNotes("");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-black/55 dark:text-white/55">
        When one party pays another for you — e.g. X owes you and you owe Y, so X pays Y directly. It lowers what
        X owes you and what you owe Y; your cash and bank balances don&apos;t change.
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Paid by (owes you)</label>
          <select value={fromPartyId} onChange={(e) => setFromPartyId(e.target.value)} className={inputClass}>
            <option value="">Select party</option>
            {sorted.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="text-xs">{balanceHint(from)}</span>
        </div>
        <ArrowRight size={18} className="mt-7 shrink-0 text-black/35 dark:text-white/35" />
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Paid to (you owe)</label>
          <select value={toPartyId} onChange={(e) => setToPartyId(e.target.value)} className={inputClass}>
            <option value="">Select party</option>
            {sorted
              .filter((p) => p.id !== fromPartyId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <span className="text-xs">{balanceHint(to)}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Date</label>
          <DateInput required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Amount</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} w-32`}
          />
        </div>
        <div className="flex min-w-40 flex-1 flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Notes (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Record transfer"}
        </button>
      </div>
      {from && to && amountNum > 0 && (
        <p className="rounded-md bg-black/[0.03] px-3 py-2 text-xs dark:bg-white/[0.05]">
          After this: {afterText(from, -Math.round(amountNum * 100))} · {afterText(to, Math.round(amountNum * 100))}
        </p>
      )}
      {error && <p className="text-sm text-[#d03b3b]">{error}</p>}
    </form>
  );
}
