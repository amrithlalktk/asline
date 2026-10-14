import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  getAccountBalances,
  getItemAverageCostMap,
  getItemStockMap,
  getPartyBalanceMap,
  getPartnerCapital,
} from "@/lib/balances";

// Balance sheet as of now, built from what the app already tracks:
//   Assets      — cash & bank balances, money parties owe us, stock at cost
//   Liabilities — money we owe parties, bank overdrafts (negative balances)
//   Equity      — assets − liabilities, split into partners' capital
//                 (contributions − withdrawals) and profit kept in the
//                 business (the rest: opening balances + profit to date)
// Party balances already net in advances (a customer's unused advance is
// money we owe them; an advance we paid a supplier is money they owe us).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [accounts, parties, dueByParty, items, stockDelta, avgCost, partners] = await Promise.all([
    getAccountBalances(),
    db.party.findMany({ select: { id: true, name: true, openingBalanceCents: true } }),
    getPartyBalanceMap(),
    db.item.findMany({ select: { id: true, name: true, unit: true, openingStockQty: true } }),
    getItemStockMap(),
    getItemAverageCostMap(),
    getPartnerCapital(),
  ]);

  // Hidden accounts still hold money — include any with a balance.
  const moneyAccounts = accounts.filter((a) => a.active || a.balanceCents !== 0);
  const cashBank = moneyAccounts
    .filter((a) => a.balanceCents > 0)
    .map((a) => ({ name: a.name, type: a.type, cents: a.balanceCents }));
  const overdrafts = moneyAccounts
    .filter((a) => a.balanceCents < 0)
    .map((a) => ({ name: a.name, type: a.type, cents: -a.balanceCents }));

  const partyBalances = parties.map((p) => ({
    name: p.name,
    cents: p.openingBalanceCents + (dueByParty.get(p.id) ?? 0),
  }));
  const receivables = partyBalances.filter((p) => p.cents > 0).sort((a, b) => b.cents - a.cents);
  const payables = partyBalances
    .filter((p) => p.cents < 0)
    .map((p) => ({ name: p.name, cents: -p.cents }))
    .sort((a, b) => b.cents - a.cents);

  // Stock valued at average purchase cost; items at or below zero add nothing.
  const stock = items
    .map((i) => {
      const qty = i.openingStockQty + (stockDelta.get(i.id) ?? 0);
      const rate = avgCost.get(i.id) ?? 0;
      return { name: i.name, unit: i.unit, qty, rateCents: rate, cents: Math.round(Math.max(0, qty) * rate) };
    })
    .filter((s) => s.cents > 0)
    .sort((a, b) => b.cents - a.cents);

  const sum = (rows: { cents: number }[]) => rows.reduce((s, r) => s + r.cents, 0);
  const totals = {
    cashBank: sum(cashBank),
    receivables: sum(receivables),
    stock: sum(stock),
    payables: sum(payables),
    overdrafts: sum(overdrafts),
  };
  const assets = totals.cashBank + totals.receivables + totals.stock;
  const liabilities = totals.payables + totals.overdrafts;

  const equityCents = assets - liabilities;
  const partnerCapital = partners
    .filter((p) => p.capitalCents !== 0)
    .map((p) => ({ name: p.name, cents: p.capitalCents }));
  const capitalCents = partnerCapital.reduce((s, p) => s + p.cents, 0);

  return NextResponse.json({
    asOf: new Date().toISOString(),
    assets: { cashBank, receivables, stock, total: assets },
    liabilities: { payables, overdrafts, total: liabilities },
    totals,
    equityCents,
    equity: { partnerCapital, capitalCents, retainedCents: equityCents - capitalCents },
  });
}
