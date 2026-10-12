import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, hashPassword, createPasswordSetupToken } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { sendMail } from "@/lib/mail";
import { getAppOrigin } from "@/lib/url";
import { z } from "zod";

const patchSchema = z.object({
  active: z.boolean().optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  resendInvite: z.literal(true).optional(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "STAFF"]).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  // Hide Super Admin accounts from Admins entirely — as far as an Admin can
  // tell, they don't exist, so this returns the same 404 a nonexistent id
  // would.
  const target = await db.user.findUnique({ where: { id } });
  if (target?.role === "SUPER_ADMIN" && session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  if (
    parsed.data.active === undefined &&
    parsed.data.password === undefined &&
    parsed.data.resendInvite === undefined &&
    parsed.data.role === undefined
  ) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (parsed.data.resendInvite) {
    if (target.passwordHash) {
      return NextResponse.json(
        { error: "This user has already set up their account" },
        { status: 400 }
      );
    }
    const rawToken = await createPasswordSetupToken(target.id);
    const origin = getAppOrigin(request);
    const setupUrl = `${origin}/reset-password?token=${rawToken}`;
    await sendMail({
      to: target.email,
      subject: "Set up your AS LINE account",
      text: `Hi ${target.name},\n\nAn account has been created for you on AS LINE. Set your password to get started — this link expires in 1 hour and can only be used once:\n\n${setupUrl}`,
    });
    return NextResponse.json({ ok: true });
  }

  if (id === session.userId && parsed.data.active === false) {
    return NextResponse.json(
      { error: "You can't deactivate your own account" },
      { status: 400 }
    );
  }

  if (id === session.userId && parsed.data.role !== undefined) {
    return NextResponse.json({ error: "You can't change your own role" }, { status: 400 });
  }

  // Only a Super Admin can promote someone to Super Admin — an Admin
  // granting that role would create a peer account it can't even see
  // afterward. (Demoting *from* Super Admin can't reach here: the target
  // lookup above already 404s a Super Admin target for a non-Super-Admin
  // session.)
  if (parsed.data.role === "SUPER_ADMIN" && session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Either removing admin-capability (deactivating, or demoting to Staff)
  // needs the same safeguard: the system always needs at least one active
  // Admin-or-Super-Admin left to manage Users/Categories.
  const losingPrivilege =
    isAdminRole(target.role) &&
    target.active &&
    ((parsed.data.active === false) ||
      (parsed.data.role !== undefined && !isAdminRole(parsed.data.role)));
  if (losingPrivilege) {
    const activePrivileged = await db.user.count({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, active: true },
    });
    if (activePrivileged <= 1) {
      return NextResponse.json(
        { error: "Can't remove the last active admin" },
        { status: 400 }
      );
    }
  }

  const user = await db.user.update({
    where: { id },
    data: {
      ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      ...(parsed.data.password ? { passwordHash: await hashPassword(parsed.data.password) } : {}),
      ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
    },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  });
  return NextResponse.json(user);
}

// Permanently removing an account is Super Admin only — Admins can still
// deactivate, which keeps the login blocked without losing anything.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (id === session.userId) {
    return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 });
  }

  const target = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      _count: {
        select: { sales: true, purchases: true, transactions: true, advancePayments: true },
      },
    },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Sales/purchases/expenses/payments keep a required link to whoever
  // recorded them, so an account with history can't be removed without
  // rewriting who entered what — deactivate it instead.
  const recordCount = Object.values(target._count).reduce((a, b) => a + b, 0);
  if (recordCount > 0) {
    return NextResponse.json(
      {
        error: `This user has recorded ${recordCount} entr${recordCount === 1 ? "y" : "ies"}, so the account can't be deleted. Deactivate it instead.`,
      },
      { status: 409 }
    );
  }

  await db.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
