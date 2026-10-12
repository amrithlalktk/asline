import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { FFA_GRADES, isAdminRole, type FfaGrade } from "@/lib/types";
import { buildSaleLine } from "@/lib/ffa";

const ffaSchema = z.object({
  lines: z
    .array(
      z.object({
        id: z.string().min(1),
        ffaGrade: z.enum(FFA_GRADES).nullable(),
      })
    )
    .min(1, "Nothing to update"),
});

// Sets (or changes) the FFA grade on an existing sale's lines — the grade
// usually arrives days after the bill, once the lot is tested. Each line is
// repriced from its base rate and the bill total recomputed; payments are
// untouched, so the change simply shows up as more (or less) still due.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sale = await db.sale.findUnique({
    where: { id },
    include: { items: { include: { item: { select: { ffaGraded: true } } } }, charges: true },
  });
  if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  // Same rule as editing the bill: admins, or whoever recorded it.
  if (!isAdminRole(session.role) && sale.userId !== session.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = ffaSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const gradeById = new Map<string, FfaGrade | null>(
    parsed.data.lines.map((l) => [l.id, l.ffaGrade])
  );
  for (const lineId of gradeById.keys()) {
    const line = sale.items.find((l) => l.id === lineId);
    if (!line) return NextResponse.json({ error: "Line not found on this bill" }, { status: 400 });
  }

  const repriced = sale.items.map((line) => {
    if (!gradeById.has(line.id)) return { id: line.id, changed: false, data: line };
    const data = buildSaleLine({
      itemId: line.itemId,
      quantity: line.quantity,
      basePriceCents: line.priceCents - line.ffaBonusCents,
      taxPercent: line.taxPercent,
      ffaGrade: gradeById.get(line.id) ?? null,
    });
    return { id: line.id, changed: true, data };
  });

  const totalCents =
    repriced.reduce((sum, l) => sum + l.data.lineTotalCents + l.data.taxCents, 0) +
    sale.charges.reduce((sum, c) => sum + c.amountCents, 0);
  if (totalCents < sale.paidCents) {
    return NextResponse.json(
      {
        error:
          "That would make the bill total less than what's already been paid — adjust the payments first.",
      },
      { status: 400 }
    );
  }

  await db.$transaction([
    ...repriced
      .filter((l) => l.changed)
      .map((l) =>
        db.saleItem.update({
          where: { id: l.id },
          data: {
            priceCents: l.data.priceCents,
            ffaBonusCents: l.data.ffaBonusCents,
            lineTotalCents: l.data.lineTotalCents,
            taxCents: l.data.taxCents,
            ffaGrade: l.data.ffaGrade,
          },
        })
      ),
    db.sale.update({ where: { id }, data: { totalCents } }),
  ]);

  return NextResponse.json({ ok: true, totalCents });
}
