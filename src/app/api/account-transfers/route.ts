import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { accountTransferSchema } from "@/lib/validation";
import { toCents } from "@/lib/money";

const INCLUDE = {
  fromAccount: { select: { id: true, name: true, type: true } },
  toAccount: { select: { id: true, name: true, type: true } },
  recordedBy: { select: { name: true } },
} as const;

// Recent transfers, newest first.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const transfers = await db.accountTransfer.findMany({
    include: INCLUDE,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  return NextResponse.json(transfers);
}

// Admin only, like managing accounts.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = accountTransferSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { date, fromAccountId, toAccountId, amount, notes } = parsed.data;
  const found = await db.account.count({ where: { id: { in: [fromAccountId, toAccountId] } } });
  if (found !== 2) return NextResponse.json({ error: "Account not found" }, { status: 400 });

  const transfer = await db.accountTransfer.create({
    data: {
      date: new Date(date),
      fromAccountId,
      toAccountId,
      amountCents: toCents(amount),
      notes: notes || null,
      userId: session.userId,
    },
    include: INCLUDE,
  });
  return NextResponse.json(transfer);
}
