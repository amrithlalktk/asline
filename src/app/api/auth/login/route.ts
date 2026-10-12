import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, verifyPassword, hasSessionSecret, SESSION_SECRET_MISSING } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";

export async function POST(request: Request) {
  if (!hasSessionSecret()) {
    return NextResponse.json({ error: SESSION_SECRET_MISSING }, { status: 500 });
  }
  const body = await request.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { email, password } = parsed.data;
  const user = await db.user.findUnique({ where: { email } });

  if (!user || !user.active) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  if (!user.passwordHash) {
    return NextResponse.json(
      { error: "This account hasn't been set up yet — check your email for the setup link." },
      { status: 401 }
    );
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await createSession({
    userId: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  });

  return NextResponse.json({ ok: true });
}
