import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { stockAdjustmentSchema } from "@/lib/validation";
import { getItemStockMap } from "@/lib/balances";

async function currentStock(itemId: string) {
  const [item, delta] = await Promise.all([
    db.item.findUnique({ where: { id: itemId }, select: { openingStockQty: true } }),
    getItemStockMap(),
  ]);
  if (!item) return null;
  return item.openingStockQty + (delta.get(itemId) ?? 0);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [stock, adjustments] = await Promise.all([
    currentStock(id),
    db.stockAdjustment.findMany({
      where: { itemId: id },
      include: { recordedBy: { select: { name: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  if (stock === null) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  return NextResponse.json({ currentStockQty: stock, adjustments });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = stockAdjustmentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const stock = await currentStock(id);
  if (stock === null) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const { date, mode, quantity, reason } = parsed.data;
  // Stored as the change, so later purchases/sales keep moving stock on
  // from the corrected figure. Rounded to avoid float noise (e.g. 0.1+0.2).
  const delta = Math.round((mode === "SET" ? quantity - stock : quantity) * 1000) / 1000;
  if (delta === 0) {
    return NextResponse.json({ error: "Stock is already at that quantity" }, { status: 400 });
  }
  const adjustment = await db.stockAdjustment.create({
    data: { itemId: id, date: new Date(date), quantity: delta, reason: reason || null, userId: session.userId },
  });
  return NextResponse.json({ ...adjustment, currentStockQty: stock + delta });
}
