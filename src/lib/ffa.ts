import { FFA_GRADES, type FfaGrade } from "@/lib/types";
import { formatCents, toCents } from "@/lib/money";

// FFA-10 is the base grade (+0); every whole grade better adds a fixed
// amount to a sale line's rate, half grades half of it (per unit):
// FFA-9.5 = +1, FFA-9 = +2, FFA-8.5 = +3 … FFA-1 = +18.
export const FFA_STEP_CENTS = 200;
const BASE_GRADE = 10;

// Best grade last → worst first, matching how the grades are quoted
// (FFA-10, FFA-9.5, FFA-9, … FFA-1) in every grade picker.
export const FFA_GRADES_DISPLAY = [...FFA_GRADES].reverse();

export function ffaBonusCents(grade: string | null | undefined) {
  if (!grade) return 0;
  const n = Number(grade.replace("FFA-", ""));
  // Whole or half grades only, within FFA-1 … FFA-10.
  if (!Number.isInteger(n * 2) || n < 1 || n > BASE_GRADE) return 0;
  return Math.round((BASE_GRADE - n) * FFA_STEP_CENTS);
}

export function ffaGradeLabel(grade: FfaGrade) {
  const bonus = ffaBonusCents(grade);
  return bonus > 0 ? `${grade} (+${formatCents(bonus)})` : `${grade} (+0)`;
}

// Builds a stored SaleItem from a submitted line. `price` is the base rate
// the user typed; the FFA amount is added on top and the stored priceCents
// is the effective rate, so bills/prints/reports show qty × rate = amount
// without knowing about FFA. ffaBonusCents keeps the added part so the base
// rate can be recovered when the bill is edited.
export function buildSaleLine(line: {
  itemId: string;
  quantity: number;
  basePriceCents: number;
  taxPercent: number;
  ffaGrade: FfaGrade | null;
}) {
  const bonusCents = ffaBonusCents(line.ffaGrade);
  const priceCents = line.basePriceCents + bonusCents;
  // Quantity is in KG and can be fractional (e.g. 1.5) — round to whole
  // cents since lineTotalCents is stored as an integer.
  const lineTotalCents = Math.round(priceCents * line.quantity);
  const taxCents = Math.round((lineTotalCents * line.taxPercent) / 100);
  return {
    itemId: line.itemId,
    quantity: line.quantity,
    priceCents,
    ffaBonusCents: bonusCents,
    lineTotalCents,
    taxPercent: line.taxPercent,
    taxCents,
    ffaGrade: line.ffaGrade,
  };
}

export function saleLineFromInput(line: {
  itemId: string;
  quantity: number;
  price: number;
  taxPercent: number;
  ffaGrade?: FfaGrade | null;
}) {
  return buildSaleLine({
    itemId: line.itemId,
    quantity: line.quantity,
    basePriceCents: toCents(line.price),
    taxPercent: line.taxPercent,
    ffaGrade: line.ffaGrade ?? null,
  });
}

type StoredSaleLine = {
  quantity: number;
  priceCents: number;
  ffaBonusCents?: number;
  taxPercent: number;
  lineTotalCents: number;
  taxCents: number;
};

// Splits a stored sale line back into what it was sold at when the bill was
// entered (base rate, no FFA) and the part the FFA grade added on top.
export function saleLineFfaSplit(l: StoredSaleLine) {
  const bonusCents = l.ffaBonusCents ?? 0;
  const baseRateCents = l.priceCents - bonusCents;
  const basePreTaxCents = Math.round(baseRateCents * l.quantity);
  const baseAmountCents = basePreTaxCents + Math.round((basePreTaxCents * l.taxPercent) / 100);
  return {
    bonusCents,
    baseRateCents,
    baseAmountCents,
    ffaAmountCents: l.lineTotalCents + l.taxCents - baseAmountCents,
  };
}

// Whole-bill version: the FFA-added amount across all lines. The originally
// sold total is then bill total − this.
export function billFfaAmountCents(items: StoredSaleLine[]) {
  return items.reduce((sum, l) => sum + saleLineFfaSplit(l).ffaAmountCents, 0);
}
