import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// Forward sales (see ForwardSale in schema.prisma): what's been delivered
// against each, and matching new sale lines to them.

export const FORWARD_INCLUDE = {
  party: { select: { id: true, name: true } },
  item: { select: { id: true, name: true, unit: true } },
  deliveries: {
    select: {
      id: true,
      quantity: true,
      lineTotalCents: true,
      sale: { select: { id: true, billNumber: true, date: true } },
    },
    orderBy: { sale: { date: "asc" } },
  },
} satisfies Prisma.ForwardSaleInclude;

type ForwardRow = Prisma.ForwardSaleGetPayload<{ include: typeof FORWARD_INCLUDE }>;

// Quantities are KG floats — treat anything this close to zero as done.
const EPS = 0.0001;

export function summarizeForward(f: ForwardRow) {
  const deliveredQty = f.deliveries.reduce((s, d) => s + d.quantity, 0);
  const pendingQty = Math.max(0, f.quantity - deliveredQty);
  const status = f.closed ? "CLOSED" : pendingQty <= EPS ? "COMPLETED" : "OPEN";
  return {
    ...f,
    valueCents: Math.round(f.rateCents * f.quantity),
    deliveredQty,
    pendingQty,
    status: status as "OPEN" | "COMPLETED" | "CLOSED",
  };
}

type LineRef = { itemId: string; quantity: number; forwardSaleId?: string | null };

// Decides which forward sale each sale line delivers against:
//   forwardSaleId given  → that one (must be the same party and item)
//   null                 → none
//   omitted              → the party's oldest open forward sale for the
//                          item that still has quantity pending (counting
//                          earlier lines of this same bill), else none.
// `excludeSaleId` leaves out the bill's own existing lines when editing it.
export async function resolveForwardLinks(
  partyId: string | null | undefined,
  lines: LineRef[],
  excludeSaleId?: string
): Promise<{ ids: (string | null)[]; error?: string }> {
  const ids: (string | null)[] = lines.map(() => null);
  if (!partyId) {
    if (lines.some((l) => l.forwardSaleId)) return { ids, error: "A forward sale needs the party on the bill" };
    return { ids };
  }
  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const forwards = await db.forwardSale.findMany({
    where: { partyId, itemId: { in: itemIds } },
    include: {
      deliveries: {
        where: excludeSaleId ? { saleId: { not: excludeSaleId } } : undefined,
        select: { quantity: true },
      },
    },
    orderBy: [{ date: "asc" }, { number: "asc" }],
  });
  const pending = new Map(
    forwards.map((f) => [f.id, f.quantity - f.deliveries.reduce((s, d) => s + d.quantity, 0)])
  );

  for (const [i, line] of lines.entries()) {
    if (line.forwardSaleId === null) continue;
    if (line.forwardSaleId) {
      const f = forwards.find((x) => x.id === line.forwardSaleId);
      if (!f || f.itemId !== line.itemId) {
        return { ids, error: "That forward sale isn't for this party and item" };
      }
      ids[i] = f.id;
    } else {
      const f = forwards.find(
        (x) => x.itemId === line.itemId && !x.closed && (pending.get(x.id) ?? 0) > EPS
      );
      if (!f) continue;
      ids[i] = f.id;
    }
    pending.set(ids[i]!, (pending.get(ids[i]!) ?? 0) - line.quantity);
  }
  return { ids };
}
