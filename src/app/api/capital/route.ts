import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { capitalEntrySchema } from "@/lib/validation";
import { toCents } from "@/lib/money";

const INCLUDE = {
  partner: { select: { id: true, name: true } },
  account: { select: { id: true, name: true } },
  recordedBy: { select: { name: true } },
} as const;

// Capital added/withdrawn by partners, newest first. ?partnerId= filters.
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const partnerId = new URL(request.url).searchParams.get("partnerId");
  const entries = await db.capitalEntry.findMany({
    where: partnerId ? { partnerId } : undefined,
    include: INCLUDE,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return NextResponse.json(entries);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = capitalEntrySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { partnerId, type, date, amount, paymentMethod, notes } = parsed.data;
  const [partner, account] = await Promise.all([
    db.partner.findUnique({ where: { id: partnerId }, select: { id: true } }),
    db.account.findUnique({ where: { id: paymentMethod }, select: { id: true } }),
  ]);
  if (!partner) return NextResponse.json({ error: "Partner not found" }, { status: 400 });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 400 });

  const entry = await db.capitalEntry.create({
    data: {
      partnerId,
      type,
      date: new Date(date),
      amountCents: toCents(amount),
      paymentMethod,
      notes: notes || null,
      userId: session.userId,
    },
    include: INCLUDE,
  });
  return NextResponse.json(entry);
}
