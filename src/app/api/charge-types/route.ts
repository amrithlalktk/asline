import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { chargeTypeSchema } from "@/lib/validation";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chargeTypes = await db.chargeType.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(chargeTypes);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = chargeTypeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    const chargeType = await db.chargeType.create({ data: parsed.data });
    return NextResponse.json(chargeType);
  } catch {
    return NextResponse.json(
      { error: "A charge type with that name already exists" },
      { status: 409 }
    );
  }
}
