import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { noteSheetPatchSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = noteSheetPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  if (parsed.data.name === undefined && parsed.data.data === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updateData: Prisma.NoteSheetUpdateInput = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.data !== undefined) updateData.data = parsed.data.data;

  const sheet = await db.noteSheet.update({ where: { id }, data: updateData });
  return NextResponse.json(sheet);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await db.noteSheet.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
