import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { itemSchema } from "@/lib/validation";
import { getItemStockMap, getItemAverageCostMap } from "@/lib/balances";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = itemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { name, unit, openingStockQty, lowStockThreshold, ffaGraded } = parsed.data;

  const item = await db.item.update({
    where: { id },
    data: {
      name,
      unit,
      openingStockQty,
      lowStockThreshold: lowStockThreshold ?? null,
      ffaGraded,
    },
  });

  const [stockDelta, avgCost] = await Promise.all([getItemStockMap(), getItemAverageCostMap()]);
  return NextResponse.json({
    ...item,
    currentStockQty: item.openingStockQty + (stockDelta.get(item.id) ?? 0),
    avgPurchaseCostCents: avgCost.get(item.id) ?? 0,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [saleItemCount, purchaseItemCount] = await Promise.all([
    db.saleItem.count({ where: { itemId: id } }),
    db.purchaseItem.count({ where: { itemId: id } }),
  ]);
  if (saleItemCount > 0 || purchaseItemCount > 0) {
    return NextResponse.json(
      { error: "Item is used in sales or purchases and can't be deleted" },
      { status: 409 }
    );
  }

  await db.item.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
