import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { partySchema } from "@/lib/validation";
import { toCents } from "@/lib/money";
import {
  getAvailableAdvanceForPurchasesMap,
  getAvailableAdvanceForSalesMap,
  getPartyBalanceMap,
} from "@/lib/balances";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [parties, dueByParty, availableAdvanceByParty, availableAdvanceForPurchaseByParty] =
    await Promise.all([
      db.party.findMany({ orderBy: { name: "asc" } }),
      getPartyBalanceMap(),
      getAvailableAdvanceForSalesMap(),
      getAvailableAdvanceForPurchasesMap(),
    ]);

  return NextResponse.json(
    parties.map((p) => ({
      ...p,
      balanceCents: p.openingBalanceCents + (dueByParty.get(p.id) ?? 0),
      availableAdvanceCents: availableAdvanceByParty.get(p.id) ?? 0,
      availableAdvanceForPurchaseCents: availableAdvanceForPurchaseByParty.get(p.id) ?? 0,
    }))
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = partySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { name, type, phone, email, address, gstNumber, notes, openingBalance } = parsed.data;
  const party = await db.party.create({
    data: {
      name,
      type,
      phone: phone || null,
      email: email || null,
      address: address || null,
      gstNumber: gstNumber || null,
      notes: notes || null,
      openingBalanceCents: toCents(openingBalance),
    },
  });

  return NextResponse.json({
    ...party,
    balanceCents: party.openingBalanceCents,
    availableAdvanceCents: 0,
    availableAdvanceForPurchaseCents: 0,
  });
}
