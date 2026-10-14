import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { partnerSchema } from "@/lib/validation";
import { getPartnerCapital } from "@/lib/balances";
import { Prisma } from "@prisma/client";

// Partners with their capital balances. Admin only, like Accounts.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getPartnerCapital());
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = partnerSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const partner = await db.partner.create({
      data: { name: parsed.data.name, phone: parsed.data.phone || null, notes: parsed.data.notes || null },
    });
    return NextResponse.json(partner);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "A partner with that name already exists" }, { status: 409 });
    }
    throw err;
  }
}
