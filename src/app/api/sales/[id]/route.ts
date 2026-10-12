import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { saleSchema } from "@/lib/validation";
import { toCents } from "@/lib/money";
import { saleLineFromInput } from "@/lib/ffa";
import { setPurchaseLinks, validatePurchaseLinks } from "@/lib/purchaseLinks";
import { resolveForwardLinks } from "@/lib/forwardSales";
import { Prisma } from "@prisma/client";

const SALE_INCLUDE = {
  party: { select: { name: true } },
  items: {
    include: {
      item: { select: { name: true, unit: true, ffaGraded: true } },
      forwardSale: { select: { id: true, number: true } },
    },
  },
  charges: true,
  payments: {
    orderBy: { date: "asc" },
    include: { excessPartyPayment: { select: { amountCents: true } } },
  },
  recordedBy: { select: { name: true } },
} satisfies Prisma.SaleInclude;

async function canModify(userId: string, isAdmin: boolean, saleId: string) {
  if (isAdmin) return true;
  const sale = await db.sale.findUnique({ where: { id: saleId }, select: { userId: true } });
  return sale?.userId === userId;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sale = await db.sale.findUnique({ where: { id }, include: SALE_INCLUDE });
  if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  return NextResponse.json(sale);
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
  const parsed = saleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // paid/paymentMethod are intentionally not applied here — once a sale
  // exists, its paidCents only changes via the payment-history endpoint
  // (POST /api/sales/[id]/payments), so editing item/charge details can
  // never clobber payments already recorded against it.
  const { date, partyId, items, charges, notes, billNumber, purchaseIds } = parsed.data;
  if (purchaseIds) {
    const linkError = await validatePurchaseLinks(purchaseIds, id);
    if (linkError) return NextResponse.json({ error: linkError }, { status: 409 });
  }
  // FFA grade adds to the rate — see saleLineFromInput. Forward-sale links
  // are resolved without counting this bill's own current lines.
  const forward = await resolveForwardLinks(partyId, items, id);
  if (forward.error) return NextResponse.json({ error: forward.error }, { status: 400 });
  const lineData = items.map((line, i) => ({
    ...saleLineFromInput(line),
    forwardSaleId: forward.ids[i],
  }));
  const chargeData = charges.map((charge) => ({
    chargeTypeId: charge.chargeTypeId || null,
    label: charge.label,
    amountCents: toCents(charge.amount),
  }));
  const totalCents =
    lineData.reduce((sum, l) => sum + l.lineTotalCents + l.taxCents, 0) +
    chargeData.reduce((sum, c) => sum + c.amountCents, 0);

  try {
    const sale = await db.$transaction(async (tx) => {
      await tx.saleItem.deleteMany({ where: { saleId: id } });
      await tx.saleCharge.deleteMany({ where: { saleId: id } });
      if (purchaseIds) await setPurchaseLinks(tx, id, purchaseIds);
      return tx.sale.update({
        where: { id },
        data: {
          billNumber,
          date: new Date(date),
          partyId: partyId || null,
          totalCents,
          notes: notes || null,
          items: { create: lineData },
          charges: { create: chargeData },
        },
        include: SALE_INCLUDE,
      });
    });

    return NextResponse.json(sale);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: `Bill #${billNumber} is already in use — pick a different number.` },
        { status: 409 }
      );
    }
    throw err;
  }
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

  await db.sale.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
