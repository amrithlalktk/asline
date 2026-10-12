import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { EXPENSE_INCLUDE } from "@/lib/expenseAllocations";
import { getSession } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const categoryId = searchParams.get("categoryId");
  const paymentMethod = searchParams.get("paymentMethod");
  const q = searchParams.get("q")?.trim();

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
  if (paymentMethod) where.paymentMethod = paymentMethod;
  if (q) where.description = { contains: q, mode: "insensitive" };

  const expenses = await db.transaction.findMany({
    where,
    include: EXPENSE_INCLUDE,
    orderBy: [{ date: "asc" }],
  });

  let totalExpenseCents = 0;
  const byCategory = new Map<string, { categoryId: string; name: string; totalCents: number }>();

  for (const e of expenses) {
    totalExpenseCents += e.amountCents;

    const existing = byCategory.get(e.categoryId);
    if (existing) {
      existing.totalCents += e.amountCents;
    } else {
      byCategory.set(e.categoryId, {
        categoryId: e.categoryId,
        name: e.category.name,
        totalCents: e.amountCents,
      });
    }
  }

  return NextResponse.json({
    totalExpenseCents,
    byCategory: Array.from(byCategory.values()).sort((a, b) => b.totalCents - a.totalCents),
    expenses,
  });
}
