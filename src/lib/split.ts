// Splits `totalCents` across bills — equally, or in proportion to each
// bill's value — so the shares always add up to the exact amount (any
// leftover paisa goes to the first bills).
export function autoSplit(
  totalCents: number,
  bills: { billTotalCents: number }[],
  mode: "EQUAL" | "VALUE"
) {
  const n = bills.length;
  if (n === 0 || totalCents <= 0) return bills.map(() => 0);
  let weights = mode === "VALUE" ? bills.map((b) => Math.max(0, b.billTotalCents)) : bills.map(() => 1);
  // All bills worth nothing — fall back to an equal split.
  if (weights.every((w) => w === 0)) weights = bills.map(() => 1);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const shares = weights.map((w) => Math.floor((totalCents * w) / weightSum));
  let left = totalCents - shares.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % n, left--) shares[i] += 1;
  return shares;
}
