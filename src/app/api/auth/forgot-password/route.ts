import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createPasswordSetupToken } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { getAppOrigin } from "@/lib/url";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  // Always respond the same way regardless of whether the email matches an
  // account — confirming/denying an email's existence here is an account
  // enumeration leak.
  const genericResponse = NextResponse.json({
    ok: true,
    message: "If that email has an account, a reset link has been sent.",
  });

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !user.active) return genericResponse;

  const rawToken = await createPasswordSetupToken(user.id);

  const origin = getAppOrigin(request);
  const resetUrl = `${origin}/reset-password?token=${rawToken}`;

  await sendMail({
    to: user.email,
    subject: "Reset your password",
    text: `Hi ${user.name},\n\nSomeone requested a password reset for your account. This link expires in 1 hour and can only be used once:\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
  });

  return genericResponse;
}
