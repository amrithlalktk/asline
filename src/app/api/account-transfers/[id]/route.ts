import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";

// Undo a transfer — both balances go back. Admin only.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { count } = await db.accountTransfer.deleteMany({ where: { id } });
  if (count === 0) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
