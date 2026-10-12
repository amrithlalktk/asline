import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { partyPaymentSchema } from "@/lib/validation";
import { toCents } from "@/lib/money";
import { resyncAdvanceForParty } from "@/lib/balances";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { paymentId } = await params;
  const body = await request.json();
  const parsed = partyPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { date, direction, amount, paymentMethod, notes } = parsed.data;

  try {
    const payment = await db.$transaction(async (tx) => {
      const updated = await tx.partyPayment.update({
        where: { id: paymentId },
        data: {
          date: new Date(date),
          direction,
          amountCents: toCents(amount),
          paymentMethod,
          notes: notes || null,
        },
      });

      // Clear any advance this payment previously funded and reapply from
      // scratch against the payment's new amount/direction — handles both
      // growing (frees more credit forward) and shrinking (a stale ADVANCE
      // row from before the edit would otherwise overstate what's paid).
      await resyncAdvanceForParty(tx, updated.partyId);

      return updated;
    });

    return NextResponse.json(payment);
  } catch (err) {
    console.error("Failed to update advance payment", err);
    return NextResponse.json(
      { error: "Could not save this change. Try logging out and back in, then retry." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { paymentId } = await params;
  await db.$transaction(async (tx) => {
    const deleted = await tx.partyPayment.delete({ where: { id: paymentId } });
    await resyncAdvanceForParty(tx, deleted.partyId);
  });
  return NextResponse.json({ ok: true });
}
