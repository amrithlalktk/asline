import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { billValueCents } from "@/lib/saleProfit";
import {
  PURCHASE_LINK_SELECT,
  findLinkablePurchases,
  setPurchaseLinks,
  summarizePurchase,
  validatePurchaseLinks,
} from "@/lib/purchaseLinks";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sale = await db.sale.findUnique({
    where: { id },
    include: {
      party: { select: { name: true } },
      items: { include: { item: { select: { name: true, unit: true } } } },
      charges: true,
      linkedPurchases: { select: PURCHASE_LINK_SELECT, orderBy: { date: "asc" } },
      expenseAllocations: {
        select: { amountCents: true, expense: { select: { description: true, date: true } } },
      },
    },
  });
  if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });

  const candidates = await findLinkablePurchases({
    itemIds: [...new Set(sale.items.map((l) => l.itemId))],
    date: sale.date,
  });

  return NextResponse.json({
    sale: {
      id: sale.id,
      billNumber: sale.billNumber,
      date: sale.date,
      partyName: sale.party?.name ?? "Cash sale",
      lines: sale.items.map((l) => ({
        itemId: l.itemId,
        name: l.item.name,
        unit: l.item.unit,
        quantity: l.quantity,
        amountCents: l.lineTotalCents,
      })),
      charges: sale.charges.map((c) => ({ label: c.label, amountCents: c.amountCents })),
      expenses: sale.expenseAllocations.map((a) => ({
        description: a.expense.description,
        date: a.expense.date,
        amountCents: a.amountCents,
      })),
      ...billValueCents(sale),
    },
    linked: sale.linkedPurchases.map(summarizePurchase),
    candidates,
  });
}

const linkSchema = z.object({ purchaseIds: z.array(z.string().min(1)).max(200) });

// Replaces the set of purchases linked to this sale.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sale = await db.sale.findUnique({ where: { id }, select: { userId: true } });
  if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  // Same rule as editing the sale: admins, or whoever recorded it.
  if (!isAdminRole(session.role) && sale.userId !== session.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = linkSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const linkError = await validatePurchaseLinks(parsed.data.purchaseIds, id);
  if (linkError) return NextResponse.json({ error: linkError }, { status: 409 });

  await db.$transaction((tx) => setPurchaseLinks(tx, id, parsed.data.purchaseIds));
  return NextResponse.json({ ok: true, linked: new Set(parsed.data.purchaseIds).size });
}
