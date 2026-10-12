import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { resyncAdvanceForParty } from "@/lib/balances";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, paymentId } = await params;

  const purchase = await db.$transaction(async (tx) => {
    const existing = await tx.purchase.findUniqueOrThrow({
      where: { id },
      select: { partyId: true },
    });
    // Cascades away any excess-as-advance credit this payment spawned (see
    // PartyPayment.sourcePurchasePayment) so it stops reducing other bills too.
    await tx.purchasePayment.delete({ where: { id: paymentId } });
    const total = await tx.purchasePayment.aggregate({
      where: { purchaseId: id },
      _sum: { amountCents: true },
    });
    await tx.purchase.update({
      where: { id },
      data: { paidCents: total._sum.amountCents ?? 0 },
    });
    // Re-derive advance applications from the party's now-current payment
    // totals — covers both the cascade above and any other stale ADVANCE
    // rows left over from an unrelated edit.
    if (existing.partyId) await resyncAdvanceForParty(tx, existing.partyId);
    return tx.purchase.findUniqueOrThrow({
      where: { id },
      include: {
        party: { select: { name: true } },
        items: { include: { item: { select: { name: true, unit: true } } } },
        charges: true,
        payments: {
          orderBy: { date: "asc" },
          include: { excessPartyPayment: { select: { amountCents: true } } },
        },
        recordedBy: { select: { name: true } },
      },
    });
  });

  return NextResponse.json(purchase);
}
