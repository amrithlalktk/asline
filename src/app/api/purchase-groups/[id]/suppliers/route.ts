import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { groupSupplierSchema } from "@/lib/validation";
import { buildPurchaseCreateData } from "@/lib/purchaseCreate";

// Adds another supplier's entry to an existing combined bill — same bill
// number and date, its own items, payment and balance. A supplier can
// appear once per bill (add more items to their existing entry instead).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const group = await db.purchaseGroup.findUnique({
    where: { id },
    select: { id: true, number: true, date: true, notes: true, purchases: { select: { partyId: true } } },
  });
  if (!group) return NextResponse.json({ error: "Combined bill not found" }, { status: 404 });

  const parsed = groupSupplierSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const part = parsed.data;
  if (group.purchases.some((p) => p.partyId === part.partyId)) {
    return NextResponse.json(
      { error: "This supplier is already on the bill — edit their entry to add items." },
      { status: 409 }
    );
  }

  const purchase = await db.purchase.create({
    data: buildPurchaseCreateData(
      { ...part, date: group.date.toISOString(), notes: group.notes, advanceAppliedCents: 0 },
      { billNumber: group.number, userId: session.userId, groupId: group.id }
    ),
    select: { id: true, billNumber: true },
  });
  return NextResponse.json(purchase);
}
