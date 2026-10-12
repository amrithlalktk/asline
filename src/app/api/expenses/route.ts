import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { expenseSchema } from "@/lib/validation";
import { toCents } from "@/lib/money";
import type { Prisma } from "@prisma/client";
import { EXPENSE_INCLUDE, allocationRows, validateAllocations } from "@/lib/expenseAllocations";

const PAGE_SIZE = 25;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const categoryId = searchParams.get("categoryId");
  const q = searchParams.get("q")?.trim();
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));

  const where: Prisma.TransactionWhereInput = { type: "EXPENSE" };
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setUTCHours(23, 59, 59, 999);
      where.date.lte = end;
    }
  }
  if (categoryId) where.categoryId = categoryId;
  if (q) where.description = { contains: q, mode: "insensitive" };

  const [expenses, total] = await Promise.all([
    db.transaction.findMany({
      where,
      include: EXPENSE_INCLUDE,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.transaction.count({ where }),
  ]);

  return NextResponse.json({
    expenses,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = expenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { date, description, amount, categoryId, paymentMethod, notes, allocations } = parsed.data;
  const amountCents = toCents(amount);
  const allocationError = await validateAllocations(allocations, amountCents);
  if (allocationError) return NextResponse.json({ error: allocationError }, { status: 400 });

  const expense = await db.transaction.create({
    data: {
      date: new Date(date),
      description,
      amountCents,
      type: "EXPENSE",
      categoryId,
      userId: session.userId,
      paymentMethod: paymentMethod || null,
      notes: notes || null,
      allocations: { create: allocationRows(allocations) },
    },
    include: EXPENSE_INCLUDE,
  });

  return NextResponse.json(expense);
}
