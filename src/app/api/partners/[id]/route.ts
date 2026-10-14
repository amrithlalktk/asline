import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { partnerSchema } from "@/lib/validation";
import { Prisma } from "@prisma/client";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = partnerSchema.partial().safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  try {
    const partner = await db.partner.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.phone !== undefined ? { phone: d.phone || null } : {}),
        ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
        ...(d.active !== undefined ? { active: d.active } : {}),
      },
    });
    return NextResponse.json(partner);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") return NextResponse.json({ error: "A partner with that name already exists" }, { status: 409 });
      if (err.code === "P2025") return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }
    throw err;
  }
}

// Only a partner with no capital entries can be deleted — otherwise hide
// them (active: false) so the history stays.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    await db.partner.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json({ error: "This partner has capital entries — hide them instead." }, { status: 409 });
    }
    throw err;
  }
}
