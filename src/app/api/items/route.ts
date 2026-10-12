import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { itemSchema } from "@/lib/validation";
import { getItemStockMap, getItemAverageCostMap } from "@/lib/balances";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [items, stockDelta, avgCost] = await Promise.all([
    db.item.findMany({ orderBy: { name: "asc" } }),
    getItemStockMap(),
    getItemAverageCostMap(),
  ]);

  return NextResponse.json(
    items.map((item) => ({
      ...item,
      currentStockQty: item.openingStockQty + (stockDelta.get(item.id) ?? 0),
      avgPurchaseCostCents: avgCost.get(item.id) ?? 0,
    }))
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = itemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { name, unit, openingStockQty, lowStockThreshold, ffaGraded } = parsed.data;

  const item = await db.item.create({
    data: {
      name,
      unit,
      openingStockQty,
      lowStockThreshold: lowStockThreshold ?? null,
      ffaGraded,
    },
  });

  return NextResponse.json({ ...item, currentStockQty: item.openingStockQty, avgPurchaseCostCents: 0 });
}
