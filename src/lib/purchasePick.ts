// Ticking one supplier's part of a combined bill ticks the rest of that
// bill too (they're usually sold together); each can still be unticked.
export function togglePurchase(
  selected: string[],
  id: string,
  candidates: { id: string; groupId: string | null }[]
) {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  const groupId = candidates.find((c) => c.id === id)?.groupId;
  const siblings = groupId ? candidates.filter((c) => c.groupId === groupId).map((c) => c.id) : [];
  return [...new Set([...selected, id, ...siblings])];
}
