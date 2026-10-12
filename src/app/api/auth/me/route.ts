import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { notifyEmails: true },
  });
  return NextResponse.json({
    userId: session.userId,
    name: session.name,
    email: session.email,
    role: session.role,
    notifyEmails: user?.notifyEmails ?? null,
  });
}

// Comma-separated list, e.g. "a@x.com, b@y.com" — normalized to a clean,
// deduped, comma-space-joined string (or null if empty) so what's stored
// can be passed straight through as a mail `to` header.
const emailListSchema = z
  .string()
  .nullable()
  .transform((raw) => {
    if (!raw) return [];
    return [...new Set(raw.split(",").map((e) => e.trim()).filter(Boolean))];
  })
  .refine((emails) => emails.every((e) => z.string().email().safeParse(e).success), {
    message: "Enter valid email addresses, separated by commas",
  })
  .transform((emails) => (emails.length > 0 ? emails.join(", ") : null));

const patchSchema = z.object({
  notifyEmails: emailListSchema,
});

// Lets a user set where their own one-click "Email PDF" sends bills/reports
// — separate from their login email (see User.notifyEmails).
export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  await db.user.update({
    where: { id: session.userId },
    data: { notifyEmails: parsed.data.notifyEmails },
  });
  return NextResponse.json({ ok: true, notifyEmails: parsed.data.notifyEmails });
}
