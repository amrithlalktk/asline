import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { forwardSaleSchema } from "@/lib/validation";
import { formatBillNumber, toCents } from "@/lib/money";
import { FORWARD_INCLUDE, summarizeForward } from "@/lib/forwardSales";
import type { Prisma } from "@prisma/client";

// ?status=OPEN|COMPLETED|CLOSED (optional), ?partyId=…, ?itemId=…
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const where: Prisma.ForwardSaleWhereInput = {};
  const partyId = searchParams.get("partyId");
  const itemId = searchParams.get("itemId");
  if (partyId) where.partyId = partyId;
  if (itemId) where.itemId = itemId;

  const rows = await db.forwardSale.findMany({
    where,
    include: FORWARD_INCLUDE,
    orderBy: [{ date: "desc" }, { number: "desc" }],
  });
  const status = searchParams.get("status");
  const list = rows.map(summarizeForward).filter((f) => !status || f.status === status);
  return NextResponse.json(list);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = forwardSaleSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  if (d.number && (await db.forwardSale.count({ where: { number: d.number } })) > 0) {
    return NextResponse.json({ error: `Fwd #${formatBillNumber(d.number)} is already used — pick a different number.` }, { status: 409 });
  }
  const last = await db.forwardSale.aggregate({ _max: { number: true } });
  const created = await db.forwardSale.create({
    data: {
      number: d.number ?? (last._max.number ?? 0) + 1,
      date: new Date(d.date),
      partyId: d.partyId,
      itemId: d.itemId,
      quantity: d.quantity,
      rateCents: toCents(d.rate),
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      notes: d.notes || null,
      userId: session.userId,
    },
    include: FORWARD_INCLUDE,
  });
  return NextResponse.json(summarizeForward(created));
}
