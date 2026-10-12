// Set NEXT_PUBLIC_CURRENCY in .env to your business's currency code (e.g. "EUR", "INR").
const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "USD";

export function formatCents(cents: number) {
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: CURRENCY,
  });
}

export function toCents(amount: number) {
  return Math.round(amount * 100);
}

// "1" -> "001" — padded to at least 3 digits; grows past that for a
// business with 1000+ bills instead of truncating.
export function formatBillNumber(billNumber: number) {
  return String(billNumber).padStart(3, "0");
}
