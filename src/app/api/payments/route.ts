import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatCents } from "@/lib/money";

const PAGE_SIZE = 25;

// Sale/Purchase payments live nested inside their bill's own `payments`
// array (see PaymentHistory), and Party advance payments are their own
// table — there's no single query that returns "every payment" across all
// three, so this endpoint fetches each kind separately (with the same
// date/party filters applied at the DB level) and merges them in memory.
// Fine at small-business scale; the reports pages already do the same kind
// of client/server aggregation instead of a true SQL UNION.
type CombinedPayment = {
  id: string;
  kind: "SALE" | "PURCHASE" | "ADVANCE";
  date: string;
  partyId: string | null;
  partyName: string;
  billNumber: number | null;
  // The id needed to build this payment's delete/edit URL — a Sale id, a
  // Purchase id, or a Party id depending on `kind`.
  refId: string;
  amountCents: number;
  direction: "RECEIVED" | "PAID" | null;
  paymentMethod: string;
  notes: string | null;
};

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const type = searchParams.get("type");
  const partyId = searchParams.get("partyId");
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") ?? PAGE_SIZE)));

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setUTCHours(23, 59, 59, 999);
    dateFilter.lte = end;
  }
  const hasDateFilter = Boolean(from || to);

  const combined: CombinedPayment[] = [];

  if (!type || type === "SALE") {
    const rows = await db.salePayment.findMany({
      where: {
        ...(hasDateFilter ? { date: dateFilter } : {}),
        ...(partyId ? { sale: { partyId } } : {}),
      },
      include: {
        sale: { select: { id: true, billNumber: true, partyId: true, party: { select: { name: true } } } },
        excessPartyPayment: { select: { amountCents: true } },
      },
    });
    for (const p of rows) {
      const excessCents = p.excessPartyPayment?.amountCents ?? 0;
      combined.push({
        id: p.id,
        kind: "SALE",
        date: p.date.toISOString(),
        partyId: p.sale.partyId,
        partyName: p.sale.party?.name ?? "Cash sale",
        billNumber: p.sale.billNumber,
        refId: p.sale.id,
        // The full amount actually received — when part of it overshot this
        // bill, that's the whole point of the note below, not just the
        // amount that landed on this bill.
        amountCents: p.amountCents + excessCents,
        direction: null,
        paymentMethod: p.paymentMethod,
        notes:
          excessCents > 0
            ? `${formatCents(p.amountCents)} applied to this bill, ${formatCents(excessCents)} added as advance for the next bill`
            : p.notes,
      });
    }
  }

  if (!type || type === "PURCHASE") {
    const rows = await db.purchasePayment.findMany({
      where: {
        ...(hasDateFilter ? { date: dateFilter } : {}),
        ...(partyId ? { purchase: { partyId } } : {}),
      },
      include: {
        purchase: { select: { id: true, billNumber: true, partyId: true, party: { select: { name: true } } } },
        excessPartyPayment: { select: { amountCents: true } },
      },
    });
    for (const p of rows) {
      const excessCents = p.excessPartyPayment?.amountCents ?? 0;
      combined.push({
        id: p.id,
        kind: "PURCHASE",
        date: p.date.toISOString(),
        partyId: p.purchase.partyId,
        partyName: p.purchase.party?.name ?? "—",
        billNumber: p.purchase.billNumber,
        refId: p.purchase.id,
        amountCents: p.amountCents + excessCents,
        direction: null,
        paymentMethod: p.paymentMethod,
        notes:
          excessCents > 0
            ? `${formatCents(p.amountCents)} applied to this bill, ${formatCents(excessCents)} added as advance for the next bill`
            : p.notes,
      });
    }
  }

  if (!type || type === "ADVANCE") {
    const rows = await db.partyPayment.findMany({
      where: {
        ...(hasDateFilter ? { date: dateFilter } : {}),
        ...(partyId ? { partyId } : {}),
      },
      include: { party: { select: { name: true } } },
    });
    for (const p of rows) {
      // Already represented by the bill payment that created it (see the
      // SALE/PURCHASE loops above) — listing it again here would double it.
      if (p.sourceSalePaymentId || p.sourcePurchasePaymentId) continue;
      combined.push({
        id: p.id,
        kind: "ADVANCE",
        date: p.date.toISOString(),
        partyId: p.partyId,
        partyName: p.party.name,
        billNumber: null,
        refId: p.partyId,
        amountCents: p.amountCents,
        direction: p.direction,
        paymentMethod: p.paymentMethod,
        notes: p.notes,
      });
    }
  }

  combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const total = combined.length;
  const start = (page - 1) * pageSize;
  const payments = combined.slice(start, start + pageSize);

  return NextResponse.json({
    payments,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
