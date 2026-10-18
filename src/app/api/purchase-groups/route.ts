import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { purchaseGroupSchema } from "@/lib/validation";
import { buildPurchaseCreateData, nextPurchaseBillNumber, purchaseNumberTaken } from "@/lib/purchaseCreate";
import { formatBillNumber, toCents } from "@/lib/money";
import { autoSplit } from "@/lib/split";

// Creates a combined purchase bill: the group, one Purchase per supplier,
// and any bill-level expenses (each split across the supplier parts by
// value) — all in one transaction so it's never half-saved.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = purchaseGroupSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { date, notes, suppliers, expenses } = parsed.data;

  // A typed bill number must be free; otherwise take the next one.
  if (parsed.data.billNumber && (await purchaseNumberTaken(db, parsed.data.billNumber))) {
    return NextResponse.json(
      { error: `Purchase #${formatBillNumber(parsed.data.billNumber)} is already used — pick a different number.` },
      { status: 409 }
    );
  }

  const group = await db.$transaction(async (tx) => {
    // One bill number for the whole bill — every supplier entry carries it.
    const billNumber = parsed.data.billNumber ?? (await nextPurchaseBillNumber(tx));
    const created = await tx.purchaseGroup.create({
      data: { number: billNumber, date: new Date(date), notes: notes || null },
    });
    const parts: { id: string; billTotalCents: number }[] = [];
    for (const part of suppliers) {
      const purchase = await tx.purchase.create({
        data: buildPurchaseCreateData(
          { ...part, date, notes: notes || null, advanceAppliedCents: 0 },
          { billNumber, userId: session.userId, groupId: created.id }
        ),
        select: { id: true, totalCents: true },
      });
      parts.push({ id: purchase.id, billTotalCents: purchase.totalCents });
    }

    for (const e of expenses) {
      const amountCents = toCents(e.amount);
      const shares = autoSplit(amountCents, parts, "VALUE");
      await tx.transaction.create({
        data: {
          date: new Date(date),
          description: e.description,
          amountCents,
          type: "EXPENSE",
          categoryId: e.categoryId,
          paymentMethod: e.paymentMethod,
          notes: `Purchase #${formatBillNumber(billNumber)}`,
          userId: session.userId,
          allocations: {
            create: parts
              .map((p, i) => ({ purchaseId: p.id, amountCents: shares[i] }))
              .filter((a) => a.amountCents > 0),
          },
        },
      });
    }
    return created;
  });

  return NextResponse.json(group);
}
