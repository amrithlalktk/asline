import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { purchaseSchema } from "@/lib/validation";
import { buildPurchaseCreateData, nextPurchaseBillNumber } from "@/lib/purchaseCreate";
import { getAvailableAdvanceForPurchasesMap } from "@/lib/balances";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE = 25;
const PURCHASE_INCLUDE = {
  party: { select: { name: true } },
  items: { include: { item: { select: { name: true, unit: true } } } },
  charges: true,
  payments: {
    orderBy: { date: "asc" },
    include: { excessPartyPayment: { select: { amountCents: true } } },
  },
  recordedBy: { select: { name: true } },
  linkedSale: { select: { id: true, billNumber: true } },
  group: { select: { id: true, number: true } },
  // Expenses charged to this bill (see ExpenseAllocation).
  expenseAllocations: {
    select: { amountCents: true, expense: { select: { id: true, description: true, date: true } } },
  },
} satisfies Prisma.PurchaseInclude;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const partyId = searchParams.get("partyId");
  const itemId = searchParams.get("itemId");
  const q = searchParams.get("q")?.trim();
  const sortBy = searchParams.get("sortBy") === "billNumber" ? "billNumber" : "date";
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  // Lets a party statement request everything in one call instead of
  // paging through — capped well above what a small business would ever
  // need in one view.
  const pageSize = Math.min(1000, Math.max(1, Number(searchParams.get("pageSize") ?? PAGE_SIZE)));

  const where: Prisma.PurchaseWhereInput = {};
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setUTCHours(23, 59, 59, 999);
      where.date.lte = end;
    }
  }
  if (partyId) where.partyId = partyId;
  // Bill number (or range) — used by the Bill Report.
  const billFrom = Number(searchParams.get("billFrom"));
  const billTo = Number(searchParams.get("billTo"));
  if (billFrom > 0 || billTo > 0) {
    where.billNumber = {};
    if (billFrom > 0) where.billNumber.gte = billFrom;
    if (billTo > 0) where.billNumber.lte = billTo;
  }
  if (itemId) where.items = { some: { itemId } };
  if (q) {
    where.OR = [
      { party: { name: { contains: q, mode: "insensitive" } } },
      { items: { some: { item: { name: { contains: q, mode: "insensitive" } } } } },
      { notes: { contains: q, mode: "insensitive" } },
    ];
  }

  const orderBy: Prisma.PurchaseOrderByWithRelationInput[] =
    sortBy === "billNumber"
      ? [{ billNumber: sortDir }, { createdAt: "asc" }]
      : [{ date: sortDir }, { billNumber: sortDir }, { createdAt: "asc" }];

  // Paged by bill, not by row: a combined bill's supplier entries share one
  // bill number and always come back together on the same page.
  const [pageBills, billGroups] = await Promise.all([
    db.purchase.findMany({
      where,
      select: { billNumber: true },
      distinct: ["billNumber"],
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.purchase.groupBy({ by: ["billNumber"], where }),
  ]);
  const total = billGroups.length;
  const purchases = await db.purchase.findMany({
    where: { AND: [where, { billNumber: { in: pageBills.map((b) => b.billNumber) } }] },
    include: PURCHASE_INCLUDE,
    orderBy,
  });

  return NextResponse.json({
    purchases,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = purchaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { date, partyId, items, charges, paid, advanceAppliedCents, paymentMethod, notes } =
    parsed.data;

  if (advanceAppliedCents > 0) {
    if (!partyId) {
      return NextResponse.json(
        { error: "Advance credit requires a party" },
        { status: 400 }
      );
    }
    const availableByParty = await getAvailableAdvanceForPurchasesMap();
    if (advanceAppliedCents > (availableByParty.get(partyId) ?? 0)) {
      return NextResponse.json(
        { error: "That party doesn't have that much advance credit available" },
        { status: 400 }
      );
    }
  }

  const billNumber = await nextPurchaseBillNumber(db);
  const purchase = await db.purchase.create({
    data: buildPurchaseCreateData(
      { date, partyId, items, charges, paid, advanceAppliedCents, paymentMethod, notes },
      { billNumber, userId: session.userId }
    ),
    include: PURCHASE_INCLUDE,
  });

  return NextResponse.json(purchase);
}
