import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { saleSchema } from "@/lib/validation";
import { toCents } from "@/lib/money";
import { saleLineFromInput } from "@/lib/ffa";
import { setPurchaseLinks, validatePurchaseLinks } from "@/lib/purchaseLinks";
import { resolveForwardLinks } from "@/lib/forwardSales";
import { getAvailableAdvanceForSalesMap } from "@/lib/balances";
import { Prisma } from "@prisma/client";

const PAGE_SIZE = 25;
const SALE_INCLUDE = {
  party: { select: { name: true, email: true } },
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
  // Enough to cost the sale from its actual purchases (see saleProfit.ts).
  linkedPurchases: {
    select: {
      id: true,
      items: { select: { lineTotalCents: true } },
      charges: { select: { amountCents: true } },
      expenseAllocations: { select: { amountCents: true } },
    },
  },
  // Expenses charged to this bill (see ExpenseAllocation).
  expenseAllocations: {
    select: { amountCents: true, expense: { select: { id: true, description: true, date: true } } },
  },
} satisfies Prisma.SaleInclude;

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

  const where: Prisma.SaleWhereInput = {};
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

  const [sales, total] = await Promise.all([
    db.sale.findMany({
      where,
      include: SALE_INCLUDE,
      orderBy:
        sortBy === "billNumber"
          ? [{ billNumber: sortDir }, { createdAt: "desc" }]
          : [{ date: sortDir }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.sale.count({ where }),
  ]);

  return NextResponse.json({
    sales,
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
  const parsed = saleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { date, partyId, items, charges, paid, advanceAppliedCents, paymentMethod, notes, billNumber, purchaseIds } =
    parsed.data;

  const linkError = await validatePurchaseLinks(purchaseIds ?? [], null);
  if (linkError) return NextResponse.json({ error: linkError }, { status: 409 });

  if (advanceAppliedCents > 0) {
    if (!partyId) {
      return NextResponse.json(
        { error: "Advance credit requires a party" },
        { status: 400 }
      );
    }
    const availableByParty = await getAvailableAdvanceForSalesMap();
    if (advanceAppliedCents > (availableByParty.get(partyId) ?? 0)) {
      return NextResponse.json(
        { error: "That party doesn't have that much advance credit available" },
        { status: 400 }
      );
    }
  }

  // FFA grade adds to the rate — see saleLineFromInput. Each line may also
  // deliver against one of the party's forward sales.
  const forward = await resolveForwardLinks(partyId, items);
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

  const paidCents = toCents(paid);
  const cashPaidCents = Math.max(0, paidCents - advanceAppliedCents);
  // "Paid now" on creation becomes the first entry(ies) in the payment
  // history, so it shows up alongside any installments added later — split
  // into an ADVANCE-sourced entry (already-received money, just applied to
  // this bill) and a CASH entry (new money) so the split stays visible.
  const paymentData = [
    ...(advanceAppliedCents > 0
      ? [
          {
            date: new Date(date),
            amountCents: advanceAppliedCents,
            paymentMethod,
            source: "ADVANCE" as const,
            notes: "Settled from advance credit",
          },
        ]
      : []),
    ...(cashPaidCents > 0
      ? [{ date: new Date(date), amountCents: cashPaidCents, paymentMethod }]
      : []),
  ];
  try {
    const sale = await db.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          billNumber,
          date: new Date(date),
          partyId: partyId || null,
          totalCents,
          paidCents,
          paymentMethod,
          notes: notes || null,
          userId: session.userId,
          items: { create: lineData },
          charges: { create: chargeData },
          payments: paymentData.length > 0 ? { create: paymentData } : undefined,
        },
        select: { id: true },
      });
      if (purchaseIds?.length) await setPurchaseLinks(tx, created.id, purchaseIds);
      return tx.sale.findUniqueOrThrow({ where: { id: created.id }, include: SALE_INCLUDE });
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
