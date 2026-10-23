import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { partyTransferSchema } from "@/lib/validation";
import { toCents } from "@/lib/money";
import { PARTY_TRANSFER_ACCOUNT_ID } from "@/lib/types";
import { sweepAdvanceIntoOutstandingPurchases, sweepAdvanceIntoOutstandingSales } from "@/lib/balances";

// Records `from` paying `to` on the business's behalf: money received from
// `from` and paid to `to` in the same breath, through the no-cash
// PARTY_TRANSFER account. Each side then settles that party's open bills
// (oldest first) exactly like an ordinary advance payment would.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = partyTransferSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { date, fromPartyId, toPartyId, amount, notes } = parsed.data;

  const parties = await db.party.findMany({
    where: { id: { in: [fromPartyId, toPartyId] } },
    select: { id: true, name: true },
  });
  const fromName = parties.find((p) => p.id === fromPartyId)?.name;
  const toName = parties.find((p) => p.id === toPartyId)?.name;
  if (!fromName || !toName) return NextResponse.json({ error: "Party not found" }, { status: 404 });

  const amountCents = toCents(amount);
  const label = `Party transfer: ${fromName} → ${toName}`;
  const note = notes ? `${label} — ${notes}` : label;

  const transfer = await db.$transaction(async (tx) => {
    const created = await tx.partyTransfer.create({
      data: { date: new Date(date), fromPartyId, toPartyId, amountCents, notes: notes || null, userId: session.userId },
    });
    const side = (partyId: string, direction: "RECEIVED" | "PAID") => ({
      partyId,
      date: new Date(date),
      direction,
      amountCents,
      paymentMethod: PARTY_TRANSFER_ACCOUNT_ID,
      notes: note,
      userId: session.userId,
      partyTransferId: created.id,
    });
    await tx.partyPayment.create({ data: side(fromPartyId, "RECEIVED") });
    await tx.partyPayment.create({ data: side(toPartyId, "PAID") });
    await sweepAdvanceIntoOutstandingSales(tx, fromPartyId, PARTY_TRANSFER_ACCOUNT_ID, label);
    await sweepAdvanceIntoOutstandingPurchases(tx, toPartyId, PARTY_TRANSFER_ACCOUNT_ID, label);
    return created;
  });

  return NextResponse.json(transfer);
}
