import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { forwardSaleSchema } from "@/lib/validation";
import { toCents } from "@/lib/money";
import { FORWARD_INCLUDE, summarizeForward } from "@/lib/forwardSales";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await db.forwardSale.findUnique({
    where: { id },
    select: { userId: true, partyId: true, itemId: true, _count: { select: { deliveries: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Forward sale not found" }, { status: 404 });
  if (!isAdminRole(session.role) && existing.userId !== session.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = forwardSaleSchema.partial().safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  // Deliveries are already billed to this party for this item.
  if (
    existing._count.deliveries > 0 &&
    ((d.partyId && d.partyId !== existing.partyId) || (d.itemId && d.itemId !== existing.itemId))
  ) {
    return NextResponse.json(
      { error: "This forward sale already has deliveries — its party and item can't change." },
      { status: 400 }
    );
  }

  const updated = await db.forwardSale.update({
    where: { id },
    data: {
      ...(d.date ? { date: new Date(d.date) } : {}),
      ...(d.partyId ? { partyId: d.partyId } : {}),
      ...(d.itemId ? { itemId: d.itemId } : {}),
      ...(d.quantity !== undefined ? { quantity: d.quantity } : {}),
      ...(d.rate !== undefined ? { rateCents: toCents(d.rate) } : {}),
      ...(d.dueDate !== undefined ? { dueDate: d.dueDate ? new Date(d.dueDate) : null } : {}),
      ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
      ...(d.closed !== undefined ? { closed: d.closed } : {}),
    },
    include: FORWARD_INCLUDE,
  });
  return NextResponse.json(summarizeForward(updated));
}

// Admin only. The delivered sales stay — they're just no longer counted
// against a forward sale.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await db.forwardSale.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
