import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, createPasswordSetupToken } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { inviteUserSchema } from "@/lib/validation";
import { sendMail } from "@/lib/mail";
import { getAppOrigin } from "@/lib/url";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await db.user.findMany({
    // Admins can't see Super Admin accounts at all — Super Admin sees
    // everyone.
    where: session.role === "SUPER_ADMIN" ? {} : { role: { not: "SUPER_ADMIN" } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      passwordHash: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(
    users.map(({ passwordHash, ...u }) => ({ ...u, hasPassword: passwordHash !== null }))
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = inviteUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { name, email, role } = parsed.data;

  // Only a Super Admin can create another Super Admin — a regular Admin
  // could otherwise mint a peer account it can't even see afterward.
  if (role === "SUPER_ADMIN" && session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let user;
  try {
    user = await db.user.create({
      data: { name, email, role, passwordHash: null },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
  } catch {
    return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
  }

  const rawToken = await createPasswordSetupToken(user.id);
  const origin = getAppOrigin(request);
  const setupUrl = `${origin}/reset-password?token=${rawToken}`;
  await sendMail({
    to: user.email,
    subject: "Set up your AS LINE account",
    text: `Hi ${name},\n\nAn account has been created for you on AS LINE. Set your password to get started — this link expires in 1 hour and can only be used once:\n\n${setupUrl}`,
  });

  return NextResponse.json(user);
}
