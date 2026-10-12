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

  const sale = await db.$transaction(async (tx) => {
    const existing = await tx.sale.findUniqueOrThrow({ where: { id }, select: { partyId: true } });
    // Cascades away any excess-as-advance credit this payment spawned (see
    // PartyPayment.sourceSalePayment) so it stops reducing other bills too.
    await tx.salePayment.delete({ where: { id: paymentId } });
    const total = await tx.salePayment.aggregate({
      where: { saleId: id },
      _sum: { amountCents: true },
    });
    await tx.sale.update({
      where: { id },
      data: { paidCents: total._sum.amountCents ?? 0 },
    });
    // Re-derive advance applications from the party's now-current payment
    // totals — covers both the cascade above and any other stale ADVANCE
    // rows left over from an unrelated edit.
    if (existing.partyId) await resyncAdvanceForParty(tx, existing.partyId);
    return tx.sale.findUniqueOrThrow({
      where: { id },
      include: {
        party: { select: { name: true } },
        items: { include: { item: { select: { name: true, unit: true, ffaGraded: true } }, forwardSale: { select: { id: true, number: true } } } },
        charges: true,
        payments: {
          orderBy: { date: "asc" },
          include: { excessPartyPayment: { select: { amountCents: true } } },
        },
        recordedBy: { select: { name: true } },
      },
    });
  });

  return NextResponse.json(sale);
}
