"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { formatBillNumber, formatCents } from "@/lib/money";
import { autoSplit } from "@/lib/split";

export { autoSplit };

export type PickedBill = {
  type: "SALE" | "PURCHASE";
  billId: string;
  billNumber: number;
  partyName: string;
  billTotalCents: number;
};
export type SplitMode = "EQUAL" | "VALUE" | "CUSTOM";

const inputClass =
  "rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-transparent";

// "Which bills was this expense for?" — add sale/purchase bills by number,
// then split the amount equally, by bill value, or by hand.
export default function ExpenseBillsPicker({
  totalCents,
  bills,
  setBills,
  mode,
  setMode,
  customCents,
  setCustomCents,
}: {
  totalCents: number;
  bills: PickedBill[];
  setBills: (b: PickedBill[]) => void;
  mode: SplitMode;
  setMode: (m: SplitMode) => void;
  customCents: Record<string, number>;
  setCustomCents: (c: Record<string, number>) => void;
}) {
  const [type, setType] = useState<"SALE" | "PURCHASE">("PURCHASE");
  const [number, setNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const key = (b: { type: string; billId: string }) => `${b.type}:${b.billId}`;
  const shares =
    mode === "CUSTOM" ? bills.map((b) => customCents[key(b)] ?? 0) : autoSplit(totalCents, bills, mode);
  const assigned = shares.reduce((a, b) => a + b, 0);

  async function addBill() {
    const n = Number(number);
    if (!n) return;
    setError(null);
    setAdding(true);
    try {
      const res = await fetch(
        `/api/${type === "SALE" ? "sales" : "purchases"}?billFrom=${n}&billTo=${n}&pageSize=1`
      );
      const data = await res.json();
      // A combined purchase bill returns one entry per supplier — add them all.
      const found: { id: string; billNumber: number; totalCents: number; party: { name: string } | null }[] =
        (type === "SALE" ? data.sales : data.purchases) ?? [];
      if (found.length === 0) {
        setError(`No ${type === "SALE" ? "sale" : "purchase"} bill #${formatBillNumber(n)}`);
        return;
      }
      const fresh = found.filter((bill) => !bills.some((b) => b.type === type && b.billId === bill.id));
      if (fresh.length === 0) {
        setError("That bill is already added");
        return;
      }
      setBills([
        ...bills,
        ...fresh.map((bill) => ({
          type,
          billId: bill.id,
          billNumber: bill.billNumber,
          partyName: bill.party?.name ?? (type === "SALE" ? "Cash sale" : "No supplier"),
          billTotalCents: bill.totalCents,
        })),
      ]);
      setNumber("");
    } finally {
      setAdding(false);
    }
  }

  function switchMode(next: SplitMode) {
    // Start custom amounts from whatever the current split shows.
    if (next === "CUSTOM" && mode !== "CUSTOM") {
      setCustomCents(Object.fromEntries(bills.map((b, i) => [key(b), shares[i]])));
    }
    setMode(next);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div>
        <p className="text-sm font-medium">For bills (optional)</p>
        <p className="text-xs text-black/50 dark:text-white/50">
          Charge this expense to one or more sale/purchase bills so it counts in their profit.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as "SALE" | "PURCHASE")}
          className={inputClass}
        >
          <option value="PURCHASE">Purchase</option>
          <option value="SALE">Sale</option>
        </select>
        <input
          type="number"
          min="1"
          placeholder="Bill no."
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addBill();
            }
          }}
          className={`${inputClass} w-24`}
        />
        <button
          type="button"
          onClick={addBill}
          disabled={adding || !number}
          className="rounded-md border border-black/15 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-white/15"
        >
          {adding ? "Finding…" : "Add bill"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {bills.length > 0 && (
        <>
          {bills.length > 1 && (
            <div className="flex flex-wrap gap-1 text-xs">
              {(
                [
                  ["EQUAL", "Split equally"],
                  ["VALUE", "By bill value"],
                  ["CUSTOM", "Custom"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`rounded-full px-2.5 py-1 ${
                    mode === m ? "bg-brand text-white" : "bg-black/5 hover:bg-black/10 dark:bg-white/10"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <ul className="flex flex-col gap-1 text-sm">
            {bills.map((b, i) => (
              <li key={key(b)} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {b.type === "SALE" ? "Sale" : "Purchase"} #{formatBillNumber(b.billNumber)}
                  <span className="text-black/50 dark:text-white/50">
                    {" "}
                    · {b.partyName} · {formatCents(b.billTotalCents)}
                  </span>
                </span>
                {mode === "CUSTOM" ? (
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={((customCents[key(b)] ?? 0) / 100).toString()}
                    onChange={(e) =>
                      setCustomCents({
                        ...customCents,
                        [key(b)]: Math.round((Number(e.target.value) || 0) * 100),
                      })
                    }
                    className={`${inputClass} w-24 text-right`}
                  />
                ) : (
                  <span className="w-24 text-right">{formatCents(shares[i])}</span>
                )}
                <button
                  type="button"
                  onClick={() => setBills(bills.filter((x) => key(x) !== key(b)))}
                  aria-label="Remove bill"
                  className="text-black/40 hover:text-black dark:text-white/40"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
          <p
            className={`text-right text-xs ${
              assigned === totalCents ? "text-black/50 dark:text-white/50" : "text-[#d03b3b]"
            }`}
          >
            Assigned {formatCents(assigned)} of {formatCents(totalCents)}
            {assigned !== totalCents && " — must match the expense amount"}
          </p>
        </>
      )}
    </div>
  );
}
