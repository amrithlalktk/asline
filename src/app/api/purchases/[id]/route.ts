import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { purchaseSchema } from "@/lib/validation";
import { formatBillNumber, toCents } from "@/lib/money";
import { purchaseNumberTaken } from "@/lib/purchaseCreate";
import type { Prisma } from "@prisma/client";

const PURCHASE_INCLUDE = {
  party: { select: { name: true, email: true } },
  items: { include: { item: { select: { name: true, unit: true } } } },
  charges: true,
  payments: {
    orderBy: { date: "asc" },
    include: { excessPartyPayment: { select: { amountCents: true } } },
  },
  recordedBy: { select: { name: true } },
} satisfies Prisma.PurchaseInclude;

async function canModify(userId: string, isAdmin: boolean, purchaseId: string) {
  if (isAdmin) return true;
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    select: { userId: true },
  });
  return purchase?.userId === userId;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const purchase = await db.purchase.findUnique({ where: { id }, include: PURCHASE_INCLUDE });
  if (!purchase) return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  return NextResponse.json(purchase);
}

export async function PATCH(
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
  const parsed = purchaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // paid/paymentMethod are intentionally not applied here — once a purchase
  // exists, its paidCents only changes via the payment-history endpoint
  // (POST /api/purchases/[id]/payments).
  const { date, partyId, items, charges, notes, billNumber } = parsed.data;

  // Renumbering: a combined bill's entries share one number, changed from
  // the bill's Summary; a single purchase can take any free number.
  const current = await db.purchase.findUnique({
    where: { id },
    select: { billNumber: true, groupId: true, group: { select: { number: true } } },
  });
  if (!current) return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  const renumber = billNumber !== undefined && billNumber !== current.billNumber;
  if (renumber && current.groupId) {
    return NextResponse.json(
      { error: `This is part of combined bill #${formatBillNumber(current.group?.number ?? current.billNumber)} — change its number from the bill's Summary.` },
      { status: 400 }
    );
  }
  if (renumber && (await purchaseNumberTaken(db, billNumber, { purchaseId: id }))) {
    return NextResponse.json(
      { error: `Purchase #${formatBillNumber(billNumber)} is already used — pick a different number.` },
      { status: 409 }
    );
  }
  const lineData = items.map((line) => {
    const priceCents = toCents(line.price);
    // Quantity is in KG and can be fractional (e.g. 1.5) — round to whole
    // cents since lineTotalCents is stored as an integer.
    const lineTotalCents = Math.round(priceCents * line.quantity);
    const taxCents = Math.round((lineTotalCents * line.taxPercent) / 100);
    return {
      itemId: line.itemId,
      quantity: line.quantity,
      priceCents,
      lineTotalCents,
      taxPercent: line.taxPercent,
      taxCents,
      ffaGrade: line.ffaGrade ?? null,
    };
  });
  const chargeData = charges.map((charge) => ({
    chargeTypeId: charge.chargeTypeId || null,
    label: charge.label,
    amountCents: toCents(charge.amount),
  }));
  const totalCents =
    lineData.reduce((sum, l) => sum + l.lineTotalCents + l.taxCents, 0) +
    chargeData.reduce((sum, c) => sum + c.amountCents, 0);

  const purchase = await db.$transaction(async (tx) => {
    await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
    await tx.purchaseCharge.deleteMany({ where: { purchaseId: id } });
    return tx.purchase.update({
      where: { id },
      data: {
        ...(renumber ? { billNumber } : {}),
        date: new Date(date),
        partyId: partyId || null,
        totalCents,
        notes: notes || null,
        items: { create: lineData },
        charges: { create: chargeData },
      },
      include: PURCHASE_INCLUDE,
    });
  });

  return NextResponse.json(purchase);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Deleting is admin/super-admin only — unlike editing, staff can't delete
  // even their own entries.
  if (!isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  await db.$transaction(async (tx) => {
    const deleted = await tx.purchase.delete({ where: { id }, select: { groupId: true } });
    // Last supplier entry of a combined bill gone → the bill itself goes,
    // so its number doesn't linger.
    if (deleted.groupId && (await tx.purchase.count({ where: { groupId: deleted.groupId } })) === 0) {
      await tx.purchaseGroup.delete({ where: { id: deleted.groupId } });
    }
  });
  return NextResponse.json({ ok: true });
}
