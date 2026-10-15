import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { formatBillNumber } from "@/lib/money";

type Movement = {
  key: string;
  date: Date;
  createdAt: Date;
  kind: string;
  details: string;
  inCents: number;
  outCents: number;
};

// Every movement through one account (cash/bank), oldest first, with a
// running balance — the same rules as getAccountBalances, so the last
// balance always equals the account's available balance:
//   in:  sale payments of fresh money, advances received, income,
//        transfers in, partner capital added
//   out: purchase payments of fresh money, advances paid, expenses,
//        transfers out, partner capital withdrawn
// (Bill payments settled from advance credit moved no money and are left out.)
// ?from=YYYY-MM-DD&to=YYYY-MM-DD — earlier movements roll into the
// "brought forward" balance.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const account = await db.account.findUnique({ where: { id } });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : null;
  const toRaw = searchParams.get("to");
  const to = toRaw ? new Date(toRaw) : null;
  if (to) to.setUTCHours(23, 59, 59, 999);

  const [salePays, purchasePays, partyPays, txs, transfers, capital] = await Promise.all([
    db.salePayment.findMany({
      where: { paymentMethod: id, source: "CASH" },
      select: {
        id: true, date: true, createdAt: true, amountCents: true, notes: true,
        sale: { select: { billNumber: true, party: { select: { name: true } } } },
      },
    }),
    db.purchasePayment.findMany({
      where: { paymentMethod: id, source: "CASH" },
      select: {
        id: true, date: true, createdAt: true, amountCents: true, notes: true,
        purchase: { select: { billNumber: true, party: { select: { name: true } } } },
      },
    }),
    db.partyPayment.findMany({
      where: { paymentMethod: id },
      select: { id: true, date: true, createdAt: true, amountCents: true, direction: true, notes: true, party: { select: { name: true } } },
    }),
    db.transaction.findMany({
      where: { paymentMethod: id },
      select: { id: true, date: true, createdAt: true, amountCents: true, type: true, description: true, category: { select: { name: true } } },
    }),
    db.accountTransfer.findMany({
      where: { OR: [{ fromAccountId: id }, { toAccountId: id }] },
      select: {
        id: true, date: true, createdAt: true, amountCents: true, notes: true, fromAccountId: true,
        fromAccount: { select: { name: true, type: true } }, toAccount: { select: { name: true, type: true } },
      },
    }),
    db.capitalEntry.findMany({
      where: { paymentMethod: id },
      select: { id: true, date: true, createdAt: true, amountCents: true, type: true, notes: true, partner: { select: { name: true } } },
    }),
  ]);

  const note = (n: string | null | undefined) => (n ? ` — ${n}` : "");
  const moves: Movement[] = [
    ...salePays.map((p) => ({
      key: `sp-${p.id}`, date: p.date, createdAt: p.createdAt, kind: "Sale payment",
      details: `Sale #${formatBillNumber(p.sale.billNumber)} · ${p.sale.party?.name ?? "Cash sale"}${note(p.notes)}`,
      inCents: p.amountCents, outCents: 0,
    })),
    ...purchasePays.map((p) => ({
      key: `pp-${p.id}`, date: p.date, createdAt: p.createdAt, kind: "Purchase payment",
      details: `Purchase #${formatBillNumber(p.purchase.billNumber)} · ${p.purchase.party?.name ?? "No supplier"}${note(p.notes)}`,
      inCents: 0, outCents: p.amountCents,
    })),
    ...partyPays.map((p) => ({
      key: `pa-${p.id}`, date: p.date, createdAt: p.createdAt,
      kind: p.direction === "RECEIVED" ? "Advance received" : "Advance paid",
      details: `${p.party.name}${note(p.notes)}`,
      inCents: p.direction === "RECEIVED" ? p.amountCents : 0,
      outCents: p.direction === "PAID" ? p.amountCents : 0,
    })),
    ...txs.map((t) => ({
      key: `tx-${t.id}`, date: t.date, createdAt: t.createdAt, kind: t.type === "INCOME" ? "Income" : "Expense",
      details: `${t.description} · ${t.category.name}`,
      inCents: t.type === "INCOME" ? t.amountCents : 0,
      outCents: t.type === "INCOME" ? 0 : t.amountCents,
    })),
    ...transfers.map((t) => {
      const out = t.fromAccountId === id;
      const kind =
        t.fromAccount.type === "BANK" && t.toAccount.type === "CASH" ? "Withdrawal"
        : t.fromAccount.type === "CASH" && t.toAccount.type === "BANK" ? "Deposit"
        : "Transfer";
      return {
        key: `tr-${t.id}`, date: t.date, createdAt: t.createdAt, kind,
        details: `${out ? `To ${t.toAccount.name}` : `From ${t.fromAccount.name}`}${note(t.notes)}`,
        inCents: out ? 0 : t.amountCents, outCents: out ? t.amountCents : 0,
      };
    }),
    ...capital.map((c) => ({
      key: `cap-${c.id}`, date: c.date, createdAt: c.createdAt,
      kind: c.type === "CONTRIBUTION" ? "Capital added" : "Capital withdrawn",
      details: `${c.partner.name}${note(c.notes)}`,
      inCents: c.type === "CONTRIBUTION" ? c.amountCents : 0,
      outCents: c.type === "WITHDRAWAL" ? c.amountCents : 0,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime());

  let balance = account.openingBalanceCents;
  const rows: (Omit<Movement, "createdAt"> & { balanceCents: number })[] = [];
  for (const m of moves) {
    if (to && m.date > to) break;
    balance += m.inCents - m.outCents;
    if (from && m.date < from) continue;
    rows.push({ key: m.key, date: m.date, kind: m.kind, details: m.details, inCents: m.inCents, outCents: m.outCents, balanceCents: balance });
  }
  // Brought forward = opening + everything before `from`.
  const broughtForwardCents = rows.length > 0 ? rows[0].balanceCents - rows[0].inCents + rows[0].outCents : balance;

  return NextResponse.json({
    account: { id: account.id, name: account.name, type: account.type, openingBalanceCents: account.openingBalanceCents },
    broughtForwardCents,
    closingCents: rows.length > 0 ? rows[rows.length - 1].balanceCents : broughtForwardCents,
    totalInCents: rows.reduce((s, r) => s + r.inCents, 0),
    totalOutCents: rows.reduce((s, r) => s + r.outCents, 0),
    rows,
  });
}
