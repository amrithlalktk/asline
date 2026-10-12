import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { partyPaymentSchema } from "@/lib/validation";
import { toCents } from "@/lib/money";
import {
  sweepAdvanceIntoOutstandingPurchases,
  sweepAdvanceIntoOutstandingSales,
} from "@/lib/balances";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const payments = await db.partyPayment.findMany({
    where: { partyId: id },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(payments);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
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
      const created = await tx.partyPayment.create({
        data: {
          partyId: id,
          date: new Date(date),
          direction,
          amountCents: toCents(amount),
          paymentMethod,
          notes: notes || null,
          userId: session.userId,
        },
      });

      // Immediately apply this (plus anything already unapplied) against the
      // party's existing outstanding bills, not just a bill created later.
      if (direction === "RECEIVED") {
        await sweepAdvanceIntoOutstandingSales(tx, id, paymentMethod);
      } else {
        await sweepAdvanceIntoOutstandingPurchases(tx, id, paymentMethod);
      }

      return created;
    });

    return NextResponse.json(payment);
  } catch (err) {
    console.error("Failed to record advance payment", err);
    return NextResponse.json(
      { error: "Could not record this payment. Try logging out and back in, then retry." },
      { status: 500 }
    );
  }
}
