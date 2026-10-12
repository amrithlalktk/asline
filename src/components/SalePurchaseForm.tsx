"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { formatBillNumber, formatCents } from "@/lib/money";
import { FFA_GRADES_DISPLAY, ffaBonusCents, ffaGradeLabel } from "@/lib/ffa";
import { billExpensesCents } from "@/lib/saleProfit";
import SaleAgainstPurchases from "@/components/SaleAgainstPurchases";
import type { ForwardSale } from "@/components/ForwardSalesPanel";
import {
  type ChargeType,
  type Item,
  type Party,
  type PaymentMethod,
  type Purchase,
  type Sale,
} from "@/lib/types";
import AccountOptions from "@/components/AccountOptions";
import { useAccounts } from "@/lib/useAccounts";

const inputClass =
  "rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent";

const OTHER_CHARGE = "__other__";

type Mode = "SALE" | "PURCHASE";

type Line = {
  itemId: string;
  quantity: string;
  price: string;
  taxPercent: string;
  ffaGrade: string;
  // Sale only: "auto" = server picks the oldest open forward sale for the
  // party+item, "" = not against a forward sale, otherwise its id.
  forward: string;
};
type ChargeLineInput = { chargeTypeId: string; label: string; amount: string };

function emptyLine(): Line {
  return { itemId: "", quantity: "1", price: "", taxPercent: "0", ffaGrade: "", forward: "auto" };
}

function emptyCharge(): ChargeLineInput {
  return { chargeTypeId: "", label: "", amount: "" };
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function SalePurchaseForm({
  mode,
  parties,
  items,
  chargeTypes,
  initial,
  onSaved,
  onCancelEdit,
  forwardSales = [],
}: {
  mode: Mode;
  parties: Party[];
  items: Item[];
  chargeTypes: ChargeType[];
  initial?: Sale | Purchase;
  onSaved: () => void;
  onCancelEdit: () => void;
  // Open forward sales (Sale mode) offered per line.
  forwardSales?: ForwardSale[];
}) {
  const apiBase = mode === "SALE" ? "/api/sales" : "/api/purchases";
  const relevantParties = parties.filter(
    (p) => p.type === "BOTH" || p.type === (mode === "SALE" ? "CUSTOMER" : "SUPPLIER")
  );

  const accounts = useAccounts();
  const [date, setDate] = useState(initial ? initial.date.slice(0, 10) : todayStr());
  // Sales are numbered by hand (matches a physical bill book) — Purchases
  // keep auto-numbering server-side, so this only matters in SALE mode.
  const [billNumber, setBillNumber] = useState(initial ? String(initial.billNumber) : "");
  const [partyId, setPartyId] = useState(initial?.partyId ?? "");
  const [lines, setLines] = useState<Line[]>(
    initial && initial.items.length > 0
      ? initial.items.map((l) => ({
          itemId: l.itemId,
          quantity: String(l.quantity),
          // Sale lines store the FFA-adjusted rate — edit the base rate.
          price: ((l.priceCents - ("ffaBonusCents" in l ? l.ffaBonusCents : 0)) / 100).toString(),
          taxPercent: String(l.taxPercent),
          ffaGrade: l.ffaGrade ?? "",
          forward: "forwardSale" in l ? (l.forwardSale?.id ?? "") : "",
        }))
      : [emptyLine()]
  );
  const [charges, setCharges] = useState<ChargeLineInput[]>(
    initial?.charges.map((c) => ({
      chargeTypeId: c.chargeTypeId ?? OTHER_CHARGE,
      label: c.label,
      amount: (c.amountCents / 100).toString(),
    })) ?? []
  );
  const [paid, setPaid] = useState(initial ? (initial.paidCents / 100).toString() : "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    initial?.paymentMethod ?? "CASH"
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  // Sale only: purchase bills this sale is against (optional). Sent only
  // when changed, so editing other fields never touches existing links.
  const initialSale = mode === "SALE" ? (initial as Sale | undefined) : undefined;
  const [purchaseIds, setPurchaseIds] = useState<string[]>(
    initialSale?.linkedPurchases?.map((p) => p.id) ?? []
  );
  const [linksTouched, setLinksTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // On a sale the FFA grade adds to the rate (see src/lib/ffa.ts); on a
  // purchase it's just a quality label.
  function effectivePriceCents(l: Line) {
    const base = Math.round((Number(l.price) || 0) * 100);
    return mode === "SALE" ? base + ffaBonusCents(l.ffaGrade) : base;
  }
  function linePreTaxCents(l: Line) {
    return Math.round((Number(l.quantity) || 0) * effectivePriceCents(l));
  }

  const itemsTotalCents = lines.reduce((sum, l) => {
    const preTaxCents = linePreTaxCents(l);
    const taxCents = Math.round((preTaxCents * (Number(l.taxPercent) || 0)) / 100);
    return sum + preTaxCents + taxCents;
  }, 0);
  const chargesTotalCents = charges.reduce(
    (sum, c) => sum + Math.round((Number(c.amount) || 0) * 100),
    0
  );
  const totalCents = itemsTotalCents + chargesTotalCents;

  // Suggest the next bill number for a brand-new sale, so most entries just
  // continue the existing series — still fully editable for anyone who
  // needs a specific number (e.g. matching a physical bill book).
  useEffect(() => {
    if (mode !== "SALE" || initial) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm(nextBillNumber?: number) {
    setDate(todayStr());
    setPartyId("");
    setLines([emptyLine()]);
    setCharges([]);
    setPaid("");
    setPaymentMethod("CASH");
    setNotes("");
    setPurchaseIds([]);
    setLinksTouched(false);
    if (nextBillNumber !== undefined) setBillNumber(String(nextBillNumber));
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function handleItemChange(index: number, itemId: string) {
    updateLine(index, { itemId, ffaGrade: "" });
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(index: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  function updateCharge(index: number, patch: Partial<ChargeLineInput>) {
    setCharges((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }
  function handleChargeTypeChange(index: number, chargeTypeId: string) {
    const type = chargeTypes.find((t) => t.id === chargeTypeId);
    updateCharge(index, { chargeTypeId, label: type?.name ?? "" });
  }
  function addCharge() {
    setCharges((prev) => [...prev, emptyCharge()]);
  }
  function removeCharge(index: number) {
    setCharges((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "SALE" && (!billNumber.trim() || Number(billNumber) <= 0)) {
      setError("Enter a valid bill number");
      return;
    }
    const validLines = lines.filter((l) => l.itemId && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      setError("Add at least one item");
      return;
    }
    // FFA grade is optional on both sales and purchases — a sale can be
    // graded later via "Add FFA" on the bill.
    const validCharges = charges.filter((c) => c.label.trim() && Number(c.amount) > 0);

    setSubmitting(true);
    try {
      const res = await fetch(initial ? `${apiBase}/${initial.id}` : apiBase, {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          ...(mode === "SALE" ? { billNumber: Number(billNumber) } : {}),
          partyId: partyId || null,
          items: validLines.map((l) => ({
            itemId: l.itemId,
            quantity: Number(l.quantity),
            price: Number(l.price) || 0,
            taxPercent: Number(l.taxPercent) || 0,
            ffaGrade: l.ffaGrade || null,
            ...(mode === "SALE" && l.forward !== "auto" ? { forwardSaleId: l.forward || null } : {}),
          })),
          charges: validCharges.map((c) => ({
            chargeTypeId: c.chargeTypeId === OTHER_CHARGE ? null : c.chargeTypeId || null,
            label: c.label.trim(),
            amount: Number(c.amount),
          })),
          paid: Number(paid || 0),
          paymentMethod,
          notes: notes || null,
          ...(mode === "SALE" && linksTouched ? { purchaseIds } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      if (!initial) {
        // Pure add: clear the form so the next row can be typed straight
        // away, instead of closing anything — no popup to reopen.
        resetForm(mode === "SALE" ? Number(billNumber) + 1 : undefined);
      }
      onSaved();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div
        className={`grid grid-cols-1 items-end gap-2 ${mode === "SALE" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
      >
        {mode === "SALE" && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Bill number</label>
            <input
              type="number"
              required
              min="1"
              step="1"
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
              className={inputClass}
            />
          </div>
        )}
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputClass}
        />
        <select
          value={partyId}
          onChange={(e) => setPartyId(e.target.value)}
          className={inputClass}
        >
          <option value="">{mode === "SALE" ? "Cash sale (no party)" : "No party"}</option>
          {relevantParties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-md border border-black/10 dark:border-white/10">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-black/[0.03] text-xs text-black/50 dark:bg-white/5 dark:text-white/50">
              <th className="border border-black/10 px-2 py-1.5 text-left font-medium dark:border-white/10">
                Item
              </th>
              <th className="w-16 border border-black/10 px-2 py-1.5 text-left font-medium dark:border-white/10">
                Qty
              </th>
              <th className="w-24 border border-black/10 px-2 py-1.5 text-left font-medium dark:border-white/10">
                Price
              </th>
              <th className="w-24 border border-black/10 px-2 py-1.5 text-left font-medium dark:border-white/10">
                FFA
              </th>
              <th className="w-16 border border-black/10 px-2 py-1.5 text-left font-medium dark:border-white/10">
                Tax %
              </th>
              <th className="w-28 border border-black/10 px-2 py-1.5 text-right font-medium dark:border-white/10">
                Amount
              </th>
              <th className="w-8 border border-black/10 px-1 py-1.5 dark:border-white/10"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const preTaxCents = linePreTaxCents(line);
              const bonusCents = mode === "SALE" ? ffaBonusCents(line.ffaGrade) : 0;
              const lineTotalCents =
                preTaxCents + Math.round((preTaxCents * (Number(line.taxPercent) || 0)) / 100);
              const selectedItem = items.find((i) => i.id === line.itemId);
              return (
                <tr key={index}>
                  <td className="border border-black/10 p-0 dark:border-white/10">
                    <select
                      required
                      value={line.itemId}
                      onChange={(e) => handleItemChange(index, e.target.value)}
                      className="w-full border-0 bg-transparent px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-black/20 dark:focus:ring-white/30"
                    >
                      <option value="">Select item</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    {mode === "SALE" && line.itemId && partyId && (() => {
                      // Forward sales this line could deliver against.
                      const options = forwardSales
                        .filter((f) => f.party.id === partyId && f.item.id === line.itemId)
                        .sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
                      const keepsOther = line.forward && line.forward !== "auto" && !options.some((o) => o.id === line.forward);
                      if (options.length === 0 && !keepsOther) return null;
                      return (
                        <select
                          value={line.forward}
                          onChange={(e) => updateLine(index, { forward: e.target.value })}
                          className="w-full border-0 border-t border-black/5 bg-[#f5a524]/[0.06] px-2 py-1 text-xs text-[#9a6200] focus:outline-none"
                        >
                          <option value="auto">Forward: auto (oldest open)</option>
                          {options.map((f) => (
                            <option key={f.id} value={f.id}>
                              Fwd #{formatBillNumber(f.number)} · {Number(f.pendingQty.toFixed(2))} pending @ {formatCents(f.rateCents)}
                            </option>
                          ))}
                          {keepsOther && <option value={line.forward}>Current forward sale</option>}
                          <option value="">Not against a forward sale</option>
                        </select>
                      );
                    })()}
                  </td>
                  <td className="border border-black/10 p-0 dark:border-white/10">
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, { quantity: e.target.value })}
                      className="w-[4.5rem] border-0 bg-transparent px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-black/20 dark:focus:ring-white/30"
                    />
                  </td>
                  <td className="border border-black/10 p-0 dark:border-white/10">
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      placeholder="Price"
                      value={line.price}
                      onChange={(e) => updateLine(index, { price: e.target.value })}
                      className="w-full border-0 bg-transparent px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-black/20 dark:focus:ring-white/30"
                    />
                  </td>
                  <td className="border border-black/10 p-0 dark:border-white/10">
                    {selectedItem ? (
                      <>
                        <select
                          value={line.ffaGrade}
                          onChange={(e) => updateLine(index, { ffaGrade: e.target.value })}
                          className="w-full border-0 bg-transparent px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-black/20 dark:focus:ring-white/30"
                        >
                          <option value="">{mode === "SALE" ? "Add later" : "No grade"}</option>
                          {FFA_GRADES_DISPLAY.map((grade) => (
                            <option key={grade} value={grade}>
                              {mode === "SALE" ? ffaGradeLabel(grade) : grade}
                            </option>
                          ))}
                        </select>
                        {bonusCents > 0 && (
                          <span className="block px-2 pb-1 text-xs text-brand">
                            Rate {formatCents(effectivePriceCents(line))}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="block px-2 py-2 text-center text-black/25 dark:text-white/25">
                        —
                      </span>
                    )}
                  </td>
                  <td className="border border-black/10 p-0 dark:border-white/10">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="0"
                      value={line.taxPercent}
                      onChange={(e) => updateLine(index, { taxPercent: e.target.value })}
                      className="w-full border-0 bg-transparent px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-black/20 dark:focus:ring-white/30"
                    />
                  </td>
                  <td className="border border-black/10 px-2 py-2 text-right text-black/70 dark:border-white/10 dark:text-white/70">
                    {formatCents(lineTotalCents)}
                  </td>
                  <td className="border border-black/10 p-0 text-center dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="rounded-md p-1.5 text-black/40 hover:bg-black/5 hover:text-[#d03b3b] dark:text-white/40 dark:hover:bg-white/10"
                      aria-label="Remove line"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button
          type="button"
          onClick={addLine}
          className="w-full border-t border-black/10 px-3 py-2 text-left text-sm underline underline-offset-4 dark:border-white/10"
        >
          + Add another item
        </button>
      </div>

      {charges.length > 0 && (
        <div className="overflow-hidden rounded-md border border-black/10 dark:border-white/10">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-black/[0.03] text-xs text-black/50 dark:bg-white/5 dark:text-white/50">
                <th className="border border-black/10 px-2 py-1.5 text-left font-medium dark:border-white/10">
                  Charge
                </th>
                <th className="w-28 border border-black/10 px-2 py-1.5 text-right font-medium dark:border-white/10">
                  Amount
                </th>
                <th className="w-8 border border-black/10 px-1 py-1.5 dark:border-white/10"></th>
              </tr>
            </thead>
            <tbody>
              {charges.map((charge, index) => (
                <tr key={index}>
                  <td className="border border-black/10 p-0 dark:border-white/10">
                    {charge.chargeTypeId === OTHER_CHARGE ? (
                      <input
                        required
                        placeholder="Describe the charge"
                        value={charge.label}
                        onChange={(e) => updateCharge(index, { label: e.target.value })}
                        className="w-full border-0 bg-transparent px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-black/20 dark:focus:ring-white/30"
                      />
                    ) : (
                      <select
                        required
                        value={charge.chargeTypeId}
                        onChange={(e) => handleChargeTypeChange(index, e.target.value)}
                        className="w-full border-0 bg-transparent px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-black/20 dark:focus:ring-white/30"
                      >
                        <option value="">Select charge</option>
                        {chargeTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name}
                          </option>
                        ))}
                        <option value={OTHER_CHARGE}>Other…</option>
                      </select>
                    )}
                  </td>
                  <td className="border border-black/10 p-0 dark:border-white/10">
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      placeholder="Amount"
                      value={charge.amount}
                      onChange={(e) => updateCharge(index, { amount: e.target.value })}
                      className="w-full border-0 bg-transparent px-2 py-2 text-right text-sm focus:outline-none focus:ring-1 focus:ring-inset focus:ring-black/20 dark:focus:ring-white/30"
                    />
                  </td>
                  <td className="border border-black/10 p-0 text-center dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => removeCharge(index)}
                      className="rounded-md p-1.5 text-black/40 hover:bg-black/5 hover:text-[#d03b3b] dark:text-white/40 dark:hover:bg-white/10"
                      aria-label="Remove charge"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        onClick={addCharge}
        className="self-start text-sm underline underline-offset-4"
      >
        + Add charge (freight, packing, handling…)
      </button>

      <div className="flex items-center justify-between border-t border-black/10 pt-2 text-sm font-medium dark:border-white/10">
        <span>Total</span>
        <span>{formatCents(totalCents)}</span>
      </div>

      {mode === "SALE" && (
        <SaleAgainstPurchases
          saleId={initial?.id}
          date={date}
          lines={lines
            .filter((l) => l.itemId)
            .map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity) || 0 }))}
          items={items}
          saleValueCents={
            lines.reduce((sum, l) => sum + linePreTaxCents(l), 0) + chargesTotalCents
          }
          saleExpensesCents={initialSale ? billExpensesCents(initialSale) : 0}
          selected={purchaseIds}
          onChange={(ids) => {
            setPurchaseIds(ids);
            setLinksTouched(true);
          }}
        />
      )}

      {initial ? (
        <p className="text-xs text-black/50 dark:text-white/50">
          Payments are recorded separately — use &quot;Payments&quot; on the list below to
          add or remove installments.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Paid now</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder={(totalCents / 100).toString()}
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Payment method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className={inputClass}
            >
              <AccountOptions accounts={accounts} current={paymentMethod} />
            </select>
          </div>
        </div>
      )}

      <textarea
        placeholder="Notes (optional)"
        value={notes ?? ""}
        onChange={(e) => setNotes(e.target.value)}
        className={inputClass}
        rows={2}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting
            ? "Saving…"
            : initial
              ? "Save changes"
              : `Add ${mode === "SALE" ? "sale" : "purchase"}`}
        </button>
        <button
          type="button"
          onClick={onCancelEdit}
          className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15"
        >
          {initial ? "Cancel edit" : "Close"}
        </button>
      </div>
    </form>
  );
}
