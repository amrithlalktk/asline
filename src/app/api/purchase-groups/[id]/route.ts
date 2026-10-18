import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { formatBillNumber } from "@/lib/money";
import { purchaseNumberTaken } from "@/lib/purchaseCreate";
import { z } from "zod";
import { Prisma } from "@prisma/client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const group = await db.purchaseGroup.findUnique({
    where: { id },
    include: {
      purchases: {
        orderBy: { billNumber: "asc" },
        include: {
          party: { select: { name: true } },
          items: { include: { item: { select: { name: true, unit: true } } } },
          charges: true,
          payments: { orderBy: { date: "asc" } },
          linkedSale: { select: { id: true, billNumber: true } },
          expenseAllocations: { select: { amountCents: true } },
        },
      },
    },
  });
  if (!group) return NextResponse.json({ error: "Combined bill not found" }, { status: 404 });

  // Expenses charged to any part of this bill, each listed once.
  const expenses = await db.transaction.findMany({
    where: { allocations: { some: { purchase: { groupId: id } } } },
    select: { id: true, description: true, amountCents: true, date: true },
    orderBy: { date: "asc" },
  });
  return NextResponse.json({ ...group, expenses });
}

// Expenses that were charged only to this bill's parts — they belong to
// the bill, so they go when it does.
async function groupOnlyExpenseIds(groupId: string) {
  const rows = await db.transaction.findMany({
    where: { allocations: { some: { purchase: { groupId } } } },
    select: { id: true, allocations: { select: { purchase: { select: { groupId: true } } } } },
  });
  return rows.filter((t) => t.allocations.every((a) => a.purchase?.groupId === groupId)).map((t) => t.id);
}

// Deleting a combined bill deletes every supplier part in it and the
// expenses entered for it — admin only, like deleting a single purchase.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const expenseIds = await groupOnlyExpenseIds(id);
  await db.$transaction([
    db.transaction.deleteMany({ where: { id: { in: expenseIds } } }),
    db.purchase.deleteMany({ where: { groupId: id } }),
    db.purchaseGroup.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}

const renumberSchema = z.object({ number: z.number().int().positive("Bill number must be a positive number") });

// Changes a combined bill's number — the bill and every supplier entry in it.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = renumberSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const group = await db.purchaseGroup.findUnique({ where: { id }, select: { number: true } });
  if (!group) return NextResponse.json({ error: "Combined bill not found" }, { status: 404 });
  const { number } = parsed.data;
  if (number === group.number) return NextResponse.json({ ok: true, number });
  if (await purchaseNumberTaken(db, number, { groupId: id })) {
    return NextResponse.json(
      { error: `Purchase #${formatBillNumber(number)} is already used — pick a different number.` },
      { status: 409 }
    );
  }
  try {
    await db.$transaction([
      db.purchaseGroup.update({ where: { id }, data: { number } }),
      db.purchase.updateMany({ where: { groupId: id }, data: { billNumber: number } }),
    ]);
  } catch (err) {
    // Belt and braces: the database's own uniqueness guard caught a clash.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: `Purchase #${formatBillNumber(number)} is already used — pick a different number.` },
        { status: 409 }
      );
    }
    throw err;
  }
  return NextResponse.json({ ok: true, number });
}
