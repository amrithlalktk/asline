"use client";

import { useState } from "react";
import type { Party, PartyType } from "@/lib/types";

const inputClass =
  "rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent";

export default function PartyForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Party;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<PartyType>(initial?.type ?? "BOTH");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [gstNumber, setGstNumber] = useState(initial?.gstNumber ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [openingBalance, setOpeningBalance] = useState(
    initial ? (initial.openingBalanceCents / 100).toString() : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(initial ? `/api/parties/${initial.id}` : "/api/parties", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          phone: phone || null,
          email: email || null,
          address: address || null,
          gstNumber: gstNumber || null,
          notes: notes || null,
          openingBalance: Number(openingBalance || 0),
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
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={inputClass}
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as PartyType)}
        className={inputClass}
      >
        <option value="BOTH">Customer & Supplier</option>
        <option value="CUSTOMER">Customer</option>
        <option value="SUPPLIER">Supplier</option>
      </select>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          placeholder="Phone (optional)"
          value={phone ?? ""}
          onChange={(e) => setPhone(e.target.value)}
          className={inputClass}
        />
        <input
          type="email"
          placeholder="Email (optional)"
          value={email ?? ""}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>
      <input
        placeholder="Address (optional)"
        value={address ?? ""}
        onChange={(e) => setAddress(e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="GST number (optional)"
        value={gstNumber ?? ""}
        onChange={(e) => setGstNumber(e.target.value)}
        className={inputClass}
      />
      <textarea
        placeholder="Notes (optional)"
        value={notes ?? ""}
        onChange={(e) => setNotes(e.target.value)}
        className={inputClass}
        rows={2}
      />
      <div className="flex flex-col gap-1">
        <label className="text-xs text-black/60 dark:text-white/60">
          Opening balance (optional — positive = they owe you, negative = you owe them)
        </label>
        <input
          type="number"
          step="0.01"
          placeholder="0"
          value={openingBalance}
          onChange={(e) => setOpeningBalance(e.target.value)}
          className={inputClass}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : initial ? "Save changes" : "Add party"}
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
