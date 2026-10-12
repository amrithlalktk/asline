import { toCents } from "@/lib/money";
import type { PaymentMethod } from "@/lib/types";
import type { FfaGrade } from "@/lib/types";

type PurchaseInput = {
  date: string;
  partyId?: string | null;
  items: { itemId: string; quantity: number; price: number; taxPercent: number; ffaGrade?: FfaGrade | null }[];
  charges: { chargeTypeId?: string | null; label: string; amount: number }[];
  paid: number;
  advanceAppliedCents: number;
  paymentMethod: PaymentMethod;
  notes?: string | null;
};

// The Prisma create data for one purchase bill — shared by a normal
// purchase (POST /api/purchases) and each supplier's part of a combined
// bill (POST /api/purchase-groups).
export function buildPurchaseCreateData(
  input: PurchaseInput,
  opts: { billNumber: number; userId: string; groupId?: string }
) {
  const lineData = input.items.map((line) => {
    const priceCents = toCents(line.price);
    // Quantity is in KG and can be fractional (e.g. 1.5) — round to whole
    // cents since lineTotalCents is stored as an integer.
    const lineTotalCents = Math.round(priceCents * line.quantity);
    const taxCents = Math.round((lineTotalCents * line.taxPercent) / 100);
    return {
      itemId: line.itemId,
      quantity: line.quantity,
      priceCents,
      lineTotalCents,
      taxPercent: line.taxPercent,
      taxCents,
      ffaGrade: line.ffaGrade ?? null,
    };
  });
  const chargeData = input.charges.map((charge) => ({
    chargeTypeId: charge.chargeTypeId || null,
    label: charge.label,
    amountCents: toCents(charge.amount),
  }));
  const totalCents =
    lineData.reduce((sum, l) => sum + l.lineTotalCents + l.taxCents, 0) +
    chargeData.reduce((sum, c) => sum + c.amountCents, 0);

  const paidCents = toCents(input.paid);
  const cashPaidCents = Math.max(0, paidCents - input.advanceAppliedCents);
  const date = new Date(input.date);
  // Split "paid now" into an ADVANCE-sourced entry (already-given money, just
  // applied to this bill) and a CASH entry (new money) — mirrors sales/route.ts.
  const paymentData = [
    ...(input.advanceAppliedCents > 0
      ? [
          {
            date,
            amountCents: input.advanceAppliedCents,
            paymentMethod: input.paymentMethod,
            source: "ADVANCE" as const,
            notes: "Settled from advance credit",
          },
        ]
      : []),
    ...(cashPaidCents > 0
      ? [{ date, amountCents: cashPaidCents, paymentMethod: input.paymentMethod }]
      : []),
  ];

  return {
    billNumber: opts.billNumber,
    date,
    partyId: input.partyId || null,
    totalCents,
    paidCents,
    paymentMethod: input.paymentMethod,
    notes: input.notes || null,
    userId: opts.userId,
    groupId: opts.groupId ?? null,
    items: { create: lineData },
    charges: { create: chargeData },
    payments: paymentData.length > 0 ? { create: paymentData } : undefined,
  };
}

type NumberingClient = {
  purchase: { aggregate: (args: { _max: { billNumber: true } }) => Promise<{ _max: { billNumber: number | null } }> };
  purchaseGroup: { aggregate: (args: { _max: { number: true } }) => Promise<{ _max: { number: number | null } }> };
};

// The next purchase bill number — one past the highest used by any
// purchase or combined bill, so a new bill never collides with either.
export async function nextPurchaseBillNumber(client: NumberingClient) {
  const [bills, groups] = await Promise.all([
    client.purchase.aggregate({ _max: { billNumber: true } }),
    client.purchaseGroup.aggregate({ _max: { number: true } }),
  ]);
  return Math.max(bills._max.billNumber ?? 0, groups._max.number ?? 0) + 1;
}
