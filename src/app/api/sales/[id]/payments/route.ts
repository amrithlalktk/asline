import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { paymentSchema } from "@/lib/validation";
import { formatBillNumber, formatCents, toCents } from "@/lib/money";
import { sweepAdvanceIntoOutstandingSales } from "@/lib/balances";

async function canModify(userId: string, isAdmin: boolean, saleId: string) {
  if (isAdmin) return true;
  const sale = await db.sale.findUnique({ where: { id: saleId }, select: { userId: true } });
  return sale?.userId === userId;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await canModify(session.userId, isAdminRole(session.role), id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { date, amount, paymentMethod, notes } = parsed.data;
  const amountCents = toCents(amount);

  try {
    const sale = await db.$transaction(async (tx) => {
      const existing = await tx.sale.findUniqueOrThrow({
        where: { id },
        select: { billNumber: true, totalCents: true, paidCents: true, partyId: true },
      });
      const dueCents = Math.max(0, existing.totalCents - existing.paidCents);
      // Anything paid beyond what's actually due on this bill becomes advance
      // credit for the party instead of over-paying the bill itself, so it's
      // automatically available to settle their next sale (see
      // getAvailableAdvanceForSalesMap) — only possible when there's a party to
      // attribute it to; a cash sale with no party keeps the old behavior.
      const billPortionCents = existing.partyId ? Math.min(amountCents, dueCents) : amountCents;
      const excessCents = amountCents - billPortionCents;

      // When the payment exceeds what's due, both halves say so — otherwise
      // this bill's history only shows the capped amount actually applied
      // here, with no sign that more cash than that changed hands.
      const splitNote =
        excessCents > 0
          ? `${formatCents(amountCents)} received — ${formatCents(excessCents)} applied as advance to next bill`
          : null;

      let billPayment = null;
      if (billPortionCents > 0) {
        billPayment = await tx.salePayment.create({
          data: {
            saleId: id,
            date: new Date(date),
            amountCents: billPortionCents,
            paymentMethod,
            notes: [notes, splitNote].filter(Boolean).join(" — ") || null,
          },
        });
      }
      if (excessCents > 0 && existing.partyId) {
        // Linked back to the bill payment that created it (when there is
        // one) so deleting that payment later cascades this credit away too,
        // instead of leaving it behind still applied to some other bill —
        // see PartyPayment.sourceSalePayment.
        await tx.partyPayment.create({
          data: {
            partyId: existing.partyId,
            date: new Date(date),
            direction: "RECEIVED",
            amountCents: excessCents,
            paymentMethod,
            notes: `Excess payment on Sale #${formatBillNumber(existing.billNumber)} — added as advance credit`,
            userId: session.userId,
            sourceSalePaymentId: billPayment?.id,
          },
        });
      }

      const total = await tx.salePayment.aggregate({
        where: { saleId: id },
        _sum: { amountCents: true },
      });
      await tx.sale.update({
        where: { id },
        data: { paidCents: total._sum.amountCents ?? 0 },
      });

      // Any advance credit the party now has — the excess above, or credit
      // already sitting unapplied from before — immediately reduces their
      // OTHER outstanding sales too, not just bills created from here on.
      if (existing.partyId) {
        await sweepAdvanceIntoOutstandingSales(
          tx,
          existing.partyId,
          paymentMethod,
          excessCents > 0
            ? `${formatCents(amountCents)} paid on Sale #${formatBillNumber(existing.billNumber)} — ${formatCents(billPortionCents)} to that bill, ${formatCents(excessCents)} as advance here`
            : undefined
        );
      }

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
  } catch (err) {
    console.error("Failed to record sale payment", err);
    return NextResponse.json(
      { error: "Could not record this payment. Try logging out and back in, then retry." },
      { status: 500 }
    );
  }
}
