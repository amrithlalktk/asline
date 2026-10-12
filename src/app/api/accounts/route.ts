import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { accountSchema } from "@/lib/validation";
import { toCents } from "@/lib/money";
import { getAccountBalances } from "@/lib/balances";
import { Prisma } from "@prisma/client";

// Every signed-in user needs the list for payment pickers; balances come
// along so the Accounts page and dashboard share one source.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getAccountBalances());
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = accountSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, type, openingBalance } = parsed.data;
  try {
    const account = await db.account.create({
      data: { name, type, openingBalanceCents: toCents(openingBalance) },
    });
    return NextResponse.json(account);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "An account with that name already exists" }, { status: 409 });
    }
    throw err;
  }
}
