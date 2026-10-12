import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";

// Undoing a stock correction is admin only, like other deletes.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; adjustmentId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, adjustmentId } = await params;
  const { count } = await db.stockAdjustment.deleteMany({ where: { id: adjustmentId, itemId: id } });
  if (count === 0) return NextResponse.json({ error: "Adjustment not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
