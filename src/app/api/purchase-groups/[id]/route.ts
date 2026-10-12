import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";

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
