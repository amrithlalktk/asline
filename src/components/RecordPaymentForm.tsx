"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatBillNumber, formatCents } from "@/lib/money";
import type {
  CombinedPayment,
  Party,
  PartyPaymentDirection,
  PaymentMethod,
  Purchase,
  Sale,
} from "@/lib/types";
import AccountOptions from "@/components/AccountOptions";
import { useAccounts } from "@/lib/useAccounts";

export type PayType = "SALE" | "PURCHASE" | "ADVANCE";

const inputClass =
  "rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-transparent";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function billLabel(bill: Sale | Purchase) {
  const balance = bill.totalCents - bill.paidCents;
  return `Bill #${formatBillNumber(bill.billNumber)} — ${bill.party?.name ?? "Cash"} — balance ${formatCents(balance)}`;
}

const kindLabel: Record<PayType, string> = {
  SALE: "Sale",
  PURCHASE: "Purchase",
  ADVANCE: "Advance",
};

// Records a payment against a Sale, a Purchase, or as a standalone Party
// advance. Shared by the consolidated /payments page (full picker, every
// party) and the Party detail page (`lockPartyId` scopes the bill search
// and skips the party picker, since the party is already known). Editing
// an existing payment only applies to Advance rows — Sale/Purchase
// payments have no edit endpoint, only create/delete (see PaymentHistory).
export default function RecordPaymentForm({
  parties,
  lockPartyId,
  editingPayment,
  onCancelEdit,
  onSaved,
}: {
  parties: Party[];
  lockPartyId?: string;
  editingPayment?: CombinedPayment | null;
  onCancelEdit?: () => void;
  onSaved: () => void;
}) {

  const accounts = useAccounts();  const [payType, setPayType] = useState<PayType>("SALE");
  const [billQuery, setBillQuery] = useState("");
  const [billResults, setBillResults] = useState<(Sale | Purchase)[]>([]);
  const [selectedBill, setSelectedBill] = useState<Sale | Purchase | null>(null);
  const [partyId, setPartyId] = useState(lockPartyId ?? "");
  const [direction, setDirection] = useState<PartyPaymentDirection>("RECEIVED");
  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [billResultsRect, setBillResultsRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const billQueryInputRef = useRef<HTMLInputElement | null>(null);
  const billResultsListRef = useRef<HTMLUListElement | null>(null);

  const editingId = editingPayment?.id ?? null;

  useEffect(() => setMounted(true), []);

  // The results list is portaled to <body> (see SuggestInput for why: Card's
  // backdrop-blur creates a stacking context an absolutely-positioned list
  // can't escape, so a later sibling Card paints over it regardless of
  // z-index) — so its position has to be tracked manually instead of via CSS.
  useEffect(() => {
    if (billResults.length === 0) return;
    function updatePosition() {
      const el = billQueryInputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setBillResultsRect({ top: r.bottom, left: r.left, width: r.width });
    }
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [billResults.length]);

  // The list can appear without the input ever being focused (see the
  // auto-load effect below), so a blur-based close alone can't dismiss it —
  // a click anywhere outside both the input and the list itself closes it,
  // covering that case too.
  useEffect(() => {
    if (billResults.length === 0) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (billQueryInputRef.current?.contains(target)) return;
      if (billResultsListRef.current?.contains(target)) return;
      setBillResults([]);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [billResults.length]);

  useEffect(() => {
    if (!editingPayment) return;
    setPayType("ADVANCE");
    setPartyId(editingPayment.partyId ?? lockPartyId ?? "");
    setDirection(editingPayment.direction ?? "RECEIVED");
    setDate(editingPayment.date.slice(0, 10));
    setAmount((editingPayment.amountCents / 100).toString());
    setPaymentMethod(editingPayment.paymentMethod);
    setNotes(editingPayment.notes ?? "");
    setFormError(null);
    setSuccessMsg(null);
  }, [editingPayment, lockPartyId]);

  function resetForm() {
    setBillQuery("");
    setBillResults([]);
    setSelectedBill(null);
    setPartyId(lockPartyId ?? "");
    setDirection("RECEIVED");
    setDate(todayStr());
    setAmount("");
    setPaymentMethod("CASH");
    setNotes("");
  }

  function switchPayType(t: PayType) {
    setPayType(t);
    resetForm();
    setFormError(null);
    setSuccessMsg(null);
  }

  const fetchBills = useCallback(
    async (q: string) => {
      // Without a lock, an empty query would return the whole Sale/Purchase
      // list — too broad to be useful as "suggestions". Locked to one
      // party, the result set is already small, so show it immediately
      // rather than making the user type something that happens to match.
      if (!q.trim() && !lockPartyId) {
        setBillResults([]);
        return;
      }
      const endpoint = payType === "SALE" ? "/api/sales" : "/api/purchases";
      const params = new URLSearchParams({ pageSize: "8" });
      if (q.trim()) params.set("q", q);
      if (lockPartyId) params.set("partyId", lockPartyId);
      const res = await fetch(`${endpoint}?${params.toString()}`);
      const data = await res.json();
      setBillResults(payType === "SALE" ? data.sales : data.purchases);
    },
    [payType, lockPartyId]
  );

  function searchBills(q: string) {
    setBillQuery(q);
    setSelectedBill(null);
    fetchBills(q);
  }

  function selectBill(bill: Sale | Purchase) {
    setSelectedBill(bill);
    setBillQuery(billLabel(bill));
    setBillResults([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccessMsg(null);

    if ((payType === "SALE" || payType === "PURCHASE") && !selectedBill) {
      setFormError("Search for and select a bill to pay first");
      return;
    }
    if (payType === "ADVANCE" && !partyId) {
      setFormError("Select a party first");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setFormError("Enter a valid amount");
      return;
    }

    setSubmitting(true);
    try {
      let url: string;
      let method: "POST" | "PATCH" = "POST";
      const body: Record<string, unknown> = {
        date,
        amount: Number(amount),
        paymentMethod,
        notes: notes || null,
      };

      if (payType === "SALE") {
        url = `/api/sales/${selectedBill!.id}/payments`;
      } else if (payType === "PURCHASE") {
        url = `/api/purchases/${selectedBill!.id}/payments`;
      } else {
        body.direction = direction;
        if (editingId) {
          url = `/api/parties/${partyId}/payments/${editingId}`;
          method = "PATCH";
        } else {
          url = `/api/parties/${partyId}/payments`;
        }
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Something went wrong");
        return;
      }
      setSuccessMsg(editingId ? "Advance payment updated." : "Payment recorded.");
      resetForm();
      onCancelEdit?.();
      onSaved();
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancelEdit() {
    resetForm();
    setFormError(null);
    setSuccessMsg(null);
    onCancelEdit?.();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {(["SALE", "PURCHASE", "ADVANCE"] as PayType[]).map((t) => (
          <button
            key={t}
            type="button"
            disabled={Boolean(editingId)}
            onClick={() => switchPayType(t)}
            className={`rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 ${
              payType === t
                ? "border-brand bg-brand text-white"
                : "border-black/15 dark:border-white/15"
            }`}
          >
            {kindLabel[t]}
          </button>
        ))}
      </div>

      {(payType === "SALE" || payType === "PURCHASE") && (
        <div className="relative flex flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">
            Search {payType === "SALE" ? "sale" : "purchase"}
            {lockPartyId ? " for this party" : " by party or bill #"}
          </label>
          <input
            ref={billQueryInputRef}
            value={billQuery}
            onChange={(e) => searchBills(e.target.value)}
            onFocus={() => fetchBills(billQuery)}
            onBlur={() => {
              // Delay so a result's onClick still fires before the list
              // hides — a plain blur would close it first and swallow the
              // click.
              window.setTimeout(() => setBillResults([]), 150);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setBillResults([]);
            }}
            placeholder={
              lockPartyId ? "Showing all bills — type an item name to narrow…" : "Type a party name…"
            }
            className={inputClass}
          />
          {mounted &&
            billResults.length > 0 &&
            billResultsRect &&
            createPortal(
              <ul
                ref={billResultsListRef}
                style={{
                  position: "fixed",
                  top: billResultsRect.top + 4,
                  left: billResultsRect.left,
                  width: billResultsRect.width,
                }}
                className="z-40 max-h-60 overflow-auto rounded-md border border-black/10 bg-white py-1 text-sm shadow-lg dark:border-white/10 dark:bg-[#1e2231]"
              >
                {billResults.map((bill) => (
                  <li key={bill.id}>
                    <button
                      type="button"
                      onClick={() => selectBill(bill)}
                      className="block w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      {billLabel(bill)}
                    </button>
                  </li>
                ))}
              </ul>,
              document.body
            )}
        </div>
      )}

      {payType === "ADVANCE" && (
        <div className="flex flex-wrap gap-2">
          {!lockPartyId && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-black/60 dark:text-white/60">Party</label>
              <select
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                disabled={Boolean(editingId)}
                className={`${inputClass} disabled:opacity-50`}
              >
                <option value="">Select party</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Direction</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as PartyPaymentDirection)}
              className={inputClass}
            >
              <option value="RECEIVED">Received from party</option>
              <option value="PAID">Paid to party</option>
            </select>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Date</label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Amount</label>
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} w-32`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Method</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            className={inputClass}
          >
            <AccountOptions accounts={accounts} current={paymentMethod} />
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Notes (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : editingId ? "Save changes" : "Record payment"}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={handleCancelEdit}
            className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15"
          >
            Cancel
          </button>
        )}
      </div>

      {formError && <p className="text-sm text-red-600">{formError}</p>}
      {successMsg && <p className="text-sm text-[#0ca30c]">{successMsg}</p>}
    </form>
  );
}
