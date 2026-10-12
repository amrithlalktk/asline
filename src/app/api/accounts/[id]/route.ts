import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { CASH_ACCOUNT_ID, isAdminRole } from "@/lib/types";
import { accountPatchSchema } from "@/lib/validation";
import { toCents } from "@/lib/money";
import { Prisma } from "@prisma/client";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = accountPatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, type, openingBalance, active } = parsed.data;
  // The built-in cash account is what new entries default to — it must
  // stay a usable cash account.
  if (id === CASH_ACCOUNT_ID && (active === false || (type && type !== "CASH"))) {
    return NextResponse.json({ error: "The Cash account can't be hidden or changed to a bank" }, { status: 400 });
  }

  try {
    const account = await db.account.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(openingBalance !== undefined ? { openingBalanceCents: toCents(openingBalance) } : {}),
        ...(active !== undefined ? { active } : {}),
      },
    });
    return NextResponse.json(account);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002")
        return NextResponse.json({ error: "An account with that name already exists" }, { status: 409 });
      if (err.code === "P2025")
        return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    throw err;
  }
}

// Only an account nothing has ever gone through can be deleted — otherwise
// hide it (active: false) so its history and balance stay intact.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (id === CASH_ACCOUNT_ID) {
    return NextResponse.json({ error: "The Cash account can't be deleted" }, { status: 400 });
  }
  try {
    await db.account.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2003")
        return NextResponse.json(
          { error: "This account has payments recorded against it — hide it instead." },
          { status: 409 }
        );
      if (err.code === "P2025")
        return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    throw err;
  }
}
