"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { formatBillNumber, formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import type { Purchase, Sale } from "@/lib/types";
import EmailPdfButton from "@/components/EmailPdfButton";

export type PreviewBillType = "SALE" | "PURCHASE";

// A quick read-only glance at a Sale/Purchase from wherever its reference is
// shown as text (party statement, payments list, reports) — item lines,
// total, and balance, without leaving the page. "View full details" links
// out to the existing print page for anyone who needs charges/payment
// history too.
export default function BillPreviewModal({
  billType,
  billId,
  onClose,
}: {
  billType: PreviewBillType;
  billId: string;
  onClose: () => void;
}) {
  const [bill, setBill] = useState<Sale | Purchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBill(null);
    setLoading(true);
    setError(null);
    const endpoint = billType === "SALE" ? `/api/sales/${billId}` : `/api/purchases/${billId}`;
    fetch(endpoint)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load this bill");
        return data as Sale | Purchase;
      })
      .then((data) => {
        if (!cancelled) setBill(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this bill");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [billType, billId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const balanceCents = bill ? bill.totalCents - bill.paidCents : 0;
  const label = billType === "SALE" ? "Sale" : "Purchase";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${label} preview`}
        className="flex max-h-full w-full max-w-md flex-col rounded-lg bg-white p-5 shadow-xl dark:bg-[#1e2231]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">
              {label} #{bill ? formatBillNumber(bill.billNumber) : "…"}
            </h2>
            {bill && (
              <p className="text-sm text-black/60 dark:text-white/60">
                {formatDate(bill.date)} ·{" "}
                {bill.party?.name ?? (billType === "SALE" ? "Cash sale" : "—")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {bill && (
            <>
              <div className="max-h-64 overflow-y-auto rounded-md border border-black/10 dark:border-white/10">
                <table className="w-full text-sm">
                  <thead className="text-left text-black/60 dark:text-white/60">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2 text-center">Weight</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bill.items.map((l) => (
                      <tr key={l.id} className="border-t border-black/5 dark:border-white/5">
                        <td className="px-3 py-2">{l.item.name}</td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">{l.quantity}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {formatCents(l.priceCents)}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {formatCents(l.lineTotalCents + l.taxCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-black/60 dark:text-white/60">Total</span>
                <span className="font-medium">{formatCents(bill.totalCents)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-black/60 dark:text-white/60">Balance</span>
                <span
                  className={`font-medium ${
                    balanceCents > 0 ? "text-[#d03b3b]" : "text-[#0ca30c]"
                  }`}
                >
                  {balanceCents > 0 ? formatCents(balanceCents) : "Paid"}
                </span>
              </div>

              <a
                href={`/print/${billType === "SALE" ? "sale" : "purchase"}/${bill.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 block text-center text-sm underline underline-offset-4"
              >
                View full details
              </a>
              <div className="mt-2 flex justify-center">
                <EmailPdfButton
                  endpoint={`/api/print/${billType === "SALE" ? "sale" : "purchase"}/${bill.id}/email`}
                  className="text-sm underline underline-offset-4"
                  defaultRecipient={
                    bill.party?.email ? { name: bill.party.name, email: bill.party.email } : null
                  }
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
