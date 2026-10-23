import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { resyncAdvanceForParty } from "@/lib/balances";

// Removes both sides of the transfer and re-derives each party's bill
// settlements from what's left.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const transfer = await db.partyTransfer.findUnique({ where: { id } });
  if (!transfer) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });

  await db.$transaction(async (tx) => {
    await tx.partyTransfer.delete({ where: { id } });
    await resyncAdvanceForParty(tx, transfer.fromPartyId);
    await resyncAdvanceForParty(tx, transfer.toPartyId);
  });
  return NextResponse.json({ ok: true });
}
