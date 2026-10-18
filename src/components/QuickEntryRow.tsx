"use client";

import { useEffect, useRef, useState } from "react";
import { FFA_GRADES_DISPLAY, ffaBonusCents, ffaGradeLabel } from "@/lib/ffa";
import { type Item, type Party } from "@/lib/types";
import SuggestInput from "@/components/SuggestInput";
import type { ForwardSale } from "@/components/ForwardSalesPanel";
import { formatBillNumber, formatCents } from "@/lib/money";
import { displayUnit } from "@/lib/units";
import DateInput from "@/components/DateInput";

// No width utility here on purpose — each input below sets its own width
// explicitly. Mixing a shared "w-full" with a per-field fixed width (e.g. on
// Qty/Price) is a coin flip in the compiled CSS over which one wins, since
// both target the same `width` property.
const cellInputClass =
  "min-w-0 rounded border border-black/15 bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-black/20 dark:border-white/15 dark:focus:ring-white/30";

// Hides the native up/down spinner on <input type="number"> — Chrome/Safari
// (::-webkit-*-spin-button) and Firefox (-moz-appearance) each need their
// own override.
const noSpinnerClass =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// A single always-present editable table row for fast, sheet-style entry:
// type item/qty/price, press Enter anywhere in the row, and it saves as a
// new sale/purchase and resets for the next line — no modal, no separate
// "Add" form. Typing a party/item name that doesn't exist yet creates it on
// the fly (minimal record) instead of blocking entry, since the whole point
// is to let you keep typing the way you would in a spreadsheet.
export default function QuickEntryRow({
  mode,
  parties,
  items,
  onPartyCreated,
  onItemCreated,
  onSaved,
  forwardSales = [],
}: {
  mode: "SALE" | "PURCHASE";
  parties: Party[];
  items: Item[];
  onPartyCreated: (party: Party) => void;
  onItemCreated: (item: Item) => void;
  onSaved: () => void;
  // Open forward sales (Sale mode) — a matching one is delivered against.
  forwardSales?: ForwardSale[];
}) {
  const apiBase = mode === "SALE" ? "/api/sales" : "/api/purchases";

  const [date, setDate] = useState(todayStr());
  // Sales are numbered by hand (matches a physical bill book). Purchases
  // may be typed too; left blank, the server takes the next free number.
  const [billNumber, setBillNumber] = useState("");
  const [partyName, setPartyName] = useState("");
  const [itemName, setItemName] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [taxPercent, setTaxPercent] = useState("0");
  const [ffaGrade, setFfaGrade] = useState("");
  const [useAdvance, setUseAdvance] = useState(true);
  const [againstForward, setAgainstForward] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemInputRef = useRef<HTMLInputElement>(null);

  // Suggest the next bill number on mount, so most rows just continue the
  // existing series — still fully editable.
  useEffect(() => {
    if (mode !== "SALE") return;
    let cancelled = false;
    fetch("/api/sales?pageSize=1&sortBy=billNumber&sortDir=desc")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const next = (data.sales?.[0]?.billNumber ?? 0) + 1;
        setBillNumber(String(next));
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // FFA can be set on any item once one is typed — or left on "FFA later"
  // and added on the bill afterwards.
  const ffaAvailable = itemName.trim() !== "";

  // On a sale the FFA grade adds to the rate (see src/lib/ffa.ts).
  const bonusCents = mode === "SALE" && ffaAvailable ? ffaBonusCents(ffaGrade) : 0;
  const effectivePriceCents = Math.round((Number(price) || 0) * 100) + bonusCents;
  const preTaxCents = Math.round((Number(qty) || 0) * effectivePriceCents);
  const taxCents = Math.round((preTaxCents * (Number(taxPercent) || 0)) / 100);
  const amountCents = preTaxCents + taxCents;

  // Sales settle against the "customer prepaid us" pool, purchases against
  // the mirror-image "we prepaid this supplier" pool (see
  // getAvailableAdvanceForSalesMap / getAvailableAdvanceForPurchasesMap).
  const matchedParty = parties.find(
    (p) => p.name.toLowerCase() === partyName.trim().toLowerCase()
  );
  // The party's oldest open forward sale for this item — the server counts
  // the line against it unless the user unticks it.
  const typedItem = items.find((i) => i.name.toLowerCase() === itemName.trim().toLowerCase());
  const openForward =
    mode === "SALE" && matchedParty && typedItem
      ? forwardSales
          .filter((f) => f.party.id === matchedParty.id && f.item.id === typedItem.id)
          .sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number)[0]
      : undefined;

  const availableAdvanceCents =
    mode === "SALE"
      ? matchedParty?.availableAdvanceCents ?? 0
      : matchedParty?.availableAdvanceForPurchaseCents ?? 0;
  const advanceAppliedCents =
    useAdvance && availableAdvanceCents > 0
      ? Math.min(availableAdvanceCents, amountCents)
      : 0;

  async function resolvePartyId(): Promise<string | null> {
    const trimmed = partyName.trim();
    if (!trimmed) return null;
    const match = parties.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    if (match) return match.id;
    const res = await fetch("/api/parties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed, type: "BOTH" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not create party");
    onPartyCreated(data);
    return data.id as string;
  }

  async function resolveItemId(): Promise<string> {
    const trimmed = itemName.trim();
    const match = items.find((i) => i.name.toLowerCase() === trimmed.toLowerCase());
    if (match) return match.id;
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed, unit: "pcs" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not create item");
    onItemCreated(data);
    return data.id as string;
  }

  async function handleSubmit() {
    setError(null);
    const trimmedItem = itemName.trim();
    const qtyNum = Number(qty);
    if (
      (mode === "SALE" && !billNumber.trim()) ||
      (billNumber.trim() && (!Number.isInteger(Number(billNumber)) || Number(billNumber) <= 0))
    ) {
      setError("Enter a valid bill number");
      return;
    }
    if (!trimmedItem) {
      setError("Item is required");
      itemInputRef.current?.focus();
      return;
    }
    if (!qtyNum || qtyNum <= 0) {
      setError("Qty must be greater than 0");
      return;
    }
    if (price === "" || Number(price) < 0) {
      setError("Price is required");
      return;
    }

    setSaving(true);
    try {
      const [partyId, itemId] = await Promise.all([resolvePartyId(), resolveItemId()]);
      const priceNum = Number(price);
      const taxPercentNum = Number(taxPercent) || 0;
      const appliedCents =
        useAdvance && availableAdvanceCents > 0
          ? Math.min(availableAdvanceCents, amountCents)
          : 0;

      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          ...(mode === "SALE" || billNumber.trim() ? { billNumber: Number(billNumber) } : {}),
          partyId,
          items: [
            {
              itemId,
              quantity: qtyNum,
              price: priceNum,
              taxPercent: taxPercentNum,
              ffaGrade: ffaAvailable && ffaGrade ? ffaGrade : null,
              // Omitted = server matches the oldest open forward sale.
              ...(openForward && !againstForward ? { forwardSaleId: null } : {}),
            },
          ],
          charges: [],
          // Otherwise recorded unpaid — collecting a fresh payment happens
          // via "Payments" on the saved row, not at entry time. `paid` is
          // rupees (the route runs it through toCents), unlike
          // `advanceAppliedCents` which is already cents.
          paid: appliedCents / 100,
          advanceAppliedCents: appliedCents,
          paymentMethod: "CASH",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      // Keep date/party so a run of entries for the same day/party stays
      // fast to type; only the line-specific fields reset.
      setItemName("");
      setQty("");
      setPrice("");
      setTaxPercent("0");
      setFfaGrade("");
      setAgainstForward(true);
      setBillNumber(mode === "SALE" ? String(Number(billNumber) + 1) : "");
      onSaved();
      itemInputRef.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!saving) handleSubmit();
    }
  }

  return (
    <tr className="border-b-2 border-t border-black/10 border-b-black/15 bg-black/[0.025] dark:border-white/10 dark:border-b-white/20 dark:bg-white/[0.04]">
      <td className="p-1 align-top">
        <input
          type="number"
          min="1"
          step="1"
          value={billNumber}
          onChange={(e) => setBillNumber(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={mode === "SALE" ? undefined : "auto"}
          title={mode === "SALE" ? undefined : "Leave blank for the next number"}
          className={`${cellInputClass} ${noSpinnerClass} w-full`}
        />
      </td>
      <td className="p-1 align-top">
        <DateInput
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`${cellInputClass} w-full`}
        />
      </td>
      <td className="p-1 align-top">
        <SuggestInput
          value={partyName}
          onChange={setPartyName}
          options={parties.map((p) => p.name)}
          placeholder={mode === "SALE" ? "Cash sale" : "No party"}
          onKeyDown={handleKeyDown}
          className={`${cellInputClass} w-full`}
        />
        {availableAdvanceCents > 0 && (
          <label className="mt-1 flex items-center gap-1.5 text-xs text-[#0ca30c]">
            <input
              type="checkbox"
              checked={useAdvance}
              onChange={(e) => setUseAdvance(e.target.checked)}
            />
            {formatCents(availableAdvanceCents)} advance available
            {advanceAppliedCents > 0 && useAdvance
              ? ` — ${formatCents(advanceAppliedCents)} will settle this bill`
              : ""}
          </label>
        )}
      </td>
      <td className="p-1 align-top">
        <SuggestInput
          inputRef={itemInputRef}
          value={itemName}
          onChange={setItemName}
          options={items.map((i) => i.name)}
          placeholder="Item name"
          onKeyDown={handleKeyDown}
          className={`${cellInputClass} w-full`}
        />
        {openForward && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[#9a6200]">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={againstForward}
                onChange={(e) => setAgainstForward(e.target.checked)}
                className="accent-[#5b3fd0]"
              />
              Against Fwd #{formatBillNumber(openForward.number)}
            </label>
            <span>
              {Number(openForward.pendingQty.toFixed(2))} {displayUnit(openForward.item.unit)} pending @{" "}
              {formatCents(openForward.rateCents)}
            </span>
            {againstForward && price === "" && (
              <button
                type="button"
                onClick={() => setPrice((openForward.rateCents / 100).toString())}
                className="underline underline-offset-2"
              >
                use rate
              </button>
            )}
          </div>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
      <td className="p-1 align-top">
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`${cellInputClass} ${noSpinnerClass} w-full text-center`}
        />
      </td>
      <td className="p-1 align-top">
        <input
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`${cellInputClass} ${noSpinnerClass} w-full`}
        />
      </td>
      <td className="p-1 align-top">
        {ffaAvailable ? (
          <>
          <select
            value={ffaGrade}
            onChange={(e) => setFfaGrade(e.target.value)}
            onKeyDown={handleKeyDown}
            className={`${cellInputClass} w-full`}
          >
            <option value="">{mode === "SALE" ? "FFA later" : "No grade"}</option>
            {FFA_GRADES_DISPLAY.map((grade) => (
              <option key={grade} value={grade}>
                {mode === "SALE" ? ffaGradeLabel(grade) : grade}
              </option>
            ))}
          </select>
          {bonusCents > 0 && (
            <p className="mt-1 text-xs text-brand">Rate {formatCents(effectivePriceCents)}</p>
          )}
          </>
        ) : (
          <div className="px-2 py-1.5 text-center text-sm text-black/25 dark:text-white/25">—</div>
        )}
      </td>
      <td className="p-1 align-top">
        <input
          type="number"
          min="0"
          max="100"
          step="0.01"
          placeholder="0"
          value={taxPercent}
          onChange={(e) => setTaxPercent(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`${cellInputClass} w-full text-center`}
        />
      </td>
      <td className="p-1 align-top">
        <div
          className={`${cellInputClass} bg-black/[0.03] text-right text-black/70 dark:bg-white/[0.05] dark:text-white/70`}
        >
          {formatCents(amountCents)}
        </div>
      </td>
      <td className="p-1 align-top">
        <button
          type="button"
          disabled={saving}
          onClick={handleSubmit}
          className="w-full rounded bg-[#0ca30c] px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add"}
        </button>
      </td>
    </tr>
  );
}
