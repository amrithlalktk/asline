import Link from "next/link";
import { ShoppingCart, Receipt, Truck, Banknote, Landmark } from "lucide-react";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { displayUnit } from "@/lib/units";
import {
  getPartyBalanceMap,
  getItemStockMap,
  getItemAverageCostMap,
  getOldestUnpaidSaleDateByParty,
  getOldestUnpaidPurchaseDateByParty,
  getAccountBalances,
} from "@/lib/balances";
import Card from "@/components/Card";
import StatCard from "@/components/StatCard";
import Meter from "@/components/Meter";
import SalePurchaseBarChart, {
  type SalePurchasePoint,
} from "@/components/SalePurchaseBarChart";

// Transaction/Sale/Purchase dates are stored as UTC midnight of the
// calendar day the user picked (a date-only value), so all day/month
// boundaries here must be computed in UTC too — mixing in server-local
// wall-clock time would shift "today" by a day in any timezone other than
// UTC.
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function utcStartOfDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function utcEndOfDay(d: Date) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)
  );
}

function sumCents<T extends Record<string, unknown>>(rows: T[], field: keyof T) {
  return rows.reduce((acc, row) => acc + ((row[field] as number) ?? 0), 0);
}

function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function severityFor(ratio: number): "good" | "warning" | "critical" {
  if (ratio >= 0.8) return "good";
  if (ratio >= 0.5) return "warning";
  return "critical";
}

const OVERDUE_DAYS = 30;
function daysSince(date: Date, now: Date) {
  return Math.floor((now.getTime() - date.getTime()) / 86400000);
}

type PaidStatus = "full" | "partial" | "none";
function paidStatus(totalCents: number, paidCents: number): PaidStatus {
  if (paidCents <= 0) return "none";
  if (paidCents >= totalCents) return "full";
  return "partial";
}
const STATUS_ROW_BG: Record<PaidStatus, string> = {
  full: "bg-[#0ca30c]/[0.06]",
  partial: "bg-[#fab219]/[0.10]",
  none: "bg-[#d03b3b]/[0.06]",
};
const STATUS_DOT: Record<PaidStatus, string> = {
  full: "#0ca30c",
  partial: "#fab219",
  none: "#d03b3b",
};
const STATUS_LABEL: Record<PaidStatus, string> = {
  full: "Paid",
  partial: "Partial",
  none: "Unpaid",
};

export default async function DashboardPage() {
  const now = new Date();
  const todayStart = utcStartOfDay(now);
  const todayEnd = utcEndOfDay(now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonthEnd = new Date(monthStart.getTime() - 1);
  const fourteenDaysAgo = utcStartOfDay(new Date(now.getTime() - 13 * 86400000));

  const [
    salesThisMonth,
    expensesThisMonth,
    purchasesThisMonth,
    salesPrevMonth,
    expensesPrevMonth,
    purchasesPrevMonth,
    salesTrend,
    purchasesTrend,
    todayPurchases,
    parties,
    dueByParty,
    oldestUnpaidSaleByParty,
    oldestUnpaidPurchaseByParty,
    items,
    stockDelta,
    avgCost,
    accountBalances,
    soldByItem,
    boughtByItem,
    expenseByCategory,
  ] = await Promise.all([
    db.sale.findMany({ where: { date: { gte: monthStart, lte: todayEnd } } }),
    db.transaction.findMany({
      where: { type: "EXPENSE", date: { gte: monthStart, lte: todayEnd } },
    }),
    db.purchase.findMany({ where: { date: { gte: monthStart, lte: todayEnd } } }),
    db.sale.findMany({ where: { date: { gte: prevMonthStart, lte: prevMonthEnd } } }),
    db.transaction.findMany({
      where: { type: "EXPENSE", date: { gte: prevMonthStart, lte: prevMonthEnd } },
    }),
    db.purchase.findMany({ where: { date: { gte: prevMonthStart, lte: prevMonthEnd } } }),
    db.sale.findMany({ where: { date: { gte: fourteenDaysAgo, lte: todayEnd } } }),
    db.purchase.findMany({ where: { date: { gte: fourteenDaysAgo, lte: todayEnd } } }),
    db.purchase.findMany({
      where: { date: { gte: todayStart, lte: todayEnd } },
      include: {
        party: { select: { name: true } },
        items: { include: { item: { select: { name: true, unit: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.party.findMany(),
    getPartyBalanceMap(),
    getOldestUnpaidSaleDateByParty(),
    getOldestUnpaidPurchaseDateByParty(),
    db.item.findMany(),
    getItemStockMap(),
    getItemAverageCostMap(),
    getAccountBalances(),
    // This month's quantity and value per item, for the month summary tile.
    db.saleItem.groupBy({
      by: ["itemId"],
      where: { sale: { date: { gte: monthStart, lte: todayEnd } } },
      _sum: { quantity: true, lineTotalCents: true, taxCents: true },
    }),
    db.purchaseItem.groupBy({
      by: ["itemId"],
      where: { purchase: { date: { gte: monthStart, lte: todayEnd } } },
      _sum: { quantity: true, lineTotalCents: true, taxCents: true },
    }),
    db.transaction.groupBy({
      by: ["categoryId"],
      where: { type: "EXPENSE", date: { gte: monthStart, lte: todayEnd } },
      _sum: { amountCents: true },
    }),
  ]);

  const saleTotal = sumCents(salesThisMonth, "totalCents");
  const expenseTotal = sumCents(expensesThisMonth, "amountCents");
  const purchaseTotal = sumCents(purchasesThisMonth, "totalCents");
  const salePaidTotal = sumCents(salesThisMonth, "paidCents");

  const saleDelta = percentDelta(saleTotal, sumCents(salesPrevMonth, "totalCents"));
  const expenseDelta = percentDelta(expenseTotal, sumCents(expensesPrevMonth, "amountCents"));
  const purchaseDelta = percentDelta(purchaseTotal, sumCents(purchasesPrevMonth, "totalCents"));

  const collectionRatio = saleTotal > 0 ? salePaidTotal / saleTotal : 1;

  // Hidden accounts still hold money, so keep any with a balance on show.
  const visibleAccounts = accountBalances.filter((a) => a.active || a.balanceCents !== 0);
  const totalAvailableCents = visibleAccounts.reduce((sum, a) => sum + a.balanceCents, 0);

  const partyBalances = parties.map((p) => {
    const balanceCents = p.openingBalanceCents + (dueByParty.get(p.id) ?? 0);
    // Receivables age from the oldest unpaid sale, payables from the oldest
    // unpaid purchase — whichever direction the current balance reflects.
    const oldestUnpaidDate =
      balanceCents > 0
        ? oldestUnpaidSaleByParty.get(p.id)
        : balanceCents < 0
          ? oldestUnpaidPurchaseByParty.get(p.id)
          : undefined;
    const overdueDays = oldestUnpaidDate ? daysSince(oldestUnpaidDate, now) : null;
    return { id: p.id, name: p.name, balanceCents, overdueDays };
  });
  const receivable = partyBalances
    .filter((p) => p.balanceCents > 0)
    .sort((a, b) => (b.overdueDays ?? -1) - (a.overdueDays ?? -1) || b.balanceCents - a.balanceCents);
  const payable = partyBalances
    .filter((p) => p.balanceCents < 0)
    .sort((a, b) => (b.overdueDays ?? -1) - (a.overdueDays ?? -1) || a.balanceCents - b.balanceCents);
  const totalReceivable = receivable.reduce((sum, p) => sum + p.balanceCents, 0);
  const totalPayable = payable.reduce((sum, p) => sum + -p.balanceCents, 0);
  const overdueReceivable = receivable
    .filter((p) => (p.overdueDays ?? 0) > OVERDUE_DAYS)
    .reduce((sum, p) => sum + p.balanceCents, 0);
  const overduePayable = payable
    .filter((p) => (p.overdueDays ?? 0) > OVERDUE_DAYS)
    .reduce((sum, p) => sum + -p.balanceCents, 0);

  const itemsWithStock = items.map((item) => ({
    ...item,
    currentStockQty: item.openingStockQty + (stockDelta.get(item.id) ?? 0),
  }));
  const stockValueCents = itemsWithStock.reduce(
    (sum, item) => sum + item.currentStockQty * (avgCost.get(item.id) ?? 0),
    0
  );
  const lowStockItems = itemsWithStock.filter(
    (item) => item.lowStockThreshold != null && item.currentStockQty <= item.lowStockThreshold
  );
  // Every item's on-hand quantity for the "All Stock" tile — alphabetical so
  // an item is easy to find; quantities are KG-style floats, so trim the
  // float noise (e.g. 12.300000001) for display.
  const allStock = [...itemsWithStock]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({
      ...item,
      qtyLabel: Number(item.currentStockQty.toFixed(2)).toLocaleString(),
      valueCents: Math.round(Math.max(0, item.currentStockQty) * (avgCost.get(item.id) ?? 0)),
      low:
        item.currentStockQty <= 0 ||
        (item.lowStockThreshold != null && item.currentStockQty <= item.lowStockThreshold),
    }));
  const stockHealthRatio =
    itemsWithStock.length > 0
      ? (itemsWithStock.length - lowStockItems.length) / itemsWithStock.length
      : 1;

  const byDay = new Map<string, SalePurchasePoint>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(fourteenDaysAgo.getTime() + i * 86400000);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, {
      // Fixed "5 Oct" style, not the browser's language order.
      label: `${d.getUTCDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]}`,
      saleCents: 0,
      purchaseCents: 0,
    });
  }
  for (const sale of salesTrend) {
    const key = sale.date.toISOString().slice(0, 10);
    const point = byDay.get(key);
    if (point) point.saleCents += sale.totalCents;
  }
  for (const purchase of purchasesTrend) {
    const key = purchase.date.toISOString().slice(0, 10);
    const point = byDay.get(key);
    if (point) point.purchaseCents += purchase.totalCents;
  }

  const todayPurchaseTotalCents = sumCents(todayPurchases, "totalCents");

  // Month summary: each item sold or bought this month with its total
  // quantity and value (incl. tax), biggest sellers first.
  const monthLabel = `${MONTH_NAMES[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
  const itemById = new Map(items.map((i) => [i.id, i]));
  const monthItems = new Map<
    string,
    { name: string; unit: string; soldQty: number; soldCents: number; boughtQty: number; boughtCents: number }
  >();
  const monthItem = (itemId: string) => {
    let row = monthItems.get(itemId);
    if (!row) {
      const item = itemById.get(itemId);
      row = { name: item?.name ?? "—", unit: item?.unit ?? "", soldQty: 0, soldCents: 0, boughtQty: 0, boughtCents: 0 };
      monthItems.set(itemId, row);
    }
    return row;
  };
  for (const g of soldByItem) {
    const row = monthItem(g.itemId);
    row.soldQty = g._sum.quantity ?? 0;
    row.soldCents = (g._sum.lineTotalCents ?? 0) + (g._sum.taxCents ?? 0);
  }
  for (const g of boughtByItem) {
    const row = monthItem(g.itemId);
    row.boughtQty = g._sum.quantity ?? 0;
    row.boughtCents = (g._sum.lineTotalCents ?? 0) + (g._sum.taxCents ?? 0);
  }
  const monthItemRows = [...monthItems.values()].sort(
    (a, b) => b.soldCents - a.soldCents || b.boughtCents - a.boughtCents || a.name.localeCompare(b.name)
  );
  const expenseCategories = await db.category.findMany({
    where: { id: { in: expenseByCategory.map((g) => g.categoryId) } },
    select: { id: true, name: true },
  });
  const categoryName = new Map(expenseCategories.map((c) => [c.id, c.name]));
  const monthExpenseRows = expenseByCategory
    .map((g) => ({ name: categoryName.get(g.categoryId) ?? "Other", cents: g._sum.amountCents ?? 0 }))
    .sort((a, b) => b.cents - a.cents);
  const qty = (n: number) => Number(n.toFixed(2)).toLocaleString();

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Sale — this month"
          value={formatCents(saleTotal)}
          icon={ShoppingCart}
          iconClassName="bg-[#0ca30c]/10 text-[#0ca30c]"
          delta={saleDelta != null ? { percent: saleDelta, isGoodWhenUp: true } : undefined}
        />
        <StatCard
          label="Expenses — this month"
          value={formatCents(expenseTotal)}
          icon={Receipt}
          iconClassName="bg-[#d03b3b]/10 text-[#d03b3b]"
          delta={expenseDelta != null ? { percent: expenseDelta, isGoodWhenUp: false } : undefined}
        />
        <StatCard
          label="Purchase — this month"
          value={formatCents(purchaseTotal)}
          icon={Truck}
          iconClassName="bg-[#2a78d6]/10 text-[#2a78d6]"
          delta={purchaseDelta != null ? { percent: purchaseDelta, isGoodWhenUp: false } : undefined}
        />
        <Card>
          <Meter
            label="Collection rate"
            valueLabel={`${Math.round(collectionRatio * 100)}%`}
            ratio={collectionRatio}
            severity={severityFor(collectionRatio)}
          />
          <p className="mt-3 text-xs text-black/50 dark:text-white/50">
            {formatCents(saleTotal - salePaidTotal)} still to collect this month
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card
            title="Sale vs Purchase — last 14 days"
            action={
              <Link href="/sale" className="text-sm underline underline-offset-4">
                View all
              </Link>
            }
          >
            <SalePurchaseBarChart data={Array.from(byDay.values())} />
          </Card>

          <Card
            title={`This month — ${monthLabel}`}
            action={
              <Link href="/reports/sales-purchases" className="text-sm underline underline-offset-4">
                Report
              </Link>
            }
          >
            <div className="flex flex-col gap-4 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-[#0ca30c]/[0.07] px-3 py-2">
                  <p className="text-xs text-black/50 dark:text-white/50">Sales</p>
                  <p className="font-semibold text-[#0ca30c]">{formatCents(saleTotal)}</p>
                </div>
                <div className="rounded-md bg-[#2a78d6]/[0.07] px-3 py-2">
                  <p className="text-xs text-black/50 dark:text-white/50">Purchases</p>
                  <p className="font-semibold text-[#2a78d6]">{formatCents(purchaseTotal)}</p>
                </div>
                <div className="rounded-md bg-[#d03b3b]/[0.07] px-3 py-2">
                  <p className="text-xs text-black/50 dark:text-white/50">Expenses</p>
                  <p className="font-semibold text-[#d03b3b]">{formatCents(expenseTotal)}</p>
                </div>
              </div>

              {monthItemRows.length === 0 ? (
                <p className="text-black/50 dark:text-white/50">No sales or purchases this month yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="text-left text-xs text-black/50 dark:text-white/50">
                      <tr>
                        <th className="py-1.5 pr-2 font-medium">Item</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Sold</th>
                        <th className="py-1.5 text-right font-medium">Purchased</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthItemRows.map((row) => (
                        <tr key={row.name} className="border-t border-black/5 dark:border-white/5">
                          <td className="py-2 pr-2 font-medium">{row.name}</td>
                          <td className="py-2 pr-2 text-right whitespace-nowrap">
                            {row.soldQty ? (
                              <>
                                {qty(row.soldQty)} {displayUnit(row.unit)}
                                <span className="block text-xs text-black/50 dark:text-white/50">
                                  {formatCents(row.soldCents)}
                                </span>
                              </>
                            ) : (
                              <span className="text-black/30 dark:text-white/30">—</span>
                            )}
                          </td>
                          <td className="py-2 text-right whitespace-nowrap">
                            {row.boughtQty ? (
                              <>
                                {qty(row.boughtQty)} {displayUnit(row.unit)}
                                <span className="block text-xs text-black/50 dark:text-white/50">
                                  {formatCents(row.boughtCents)}
                                </span>
                              </>
                            ) : (
                              <span className="text-black/30 dark:text-white/30">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {monthExpenseRows.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-black/50 dark:text-white/50">Expenses by category</p>
                  <ul className="flex flex-col gap-1">
                    {monthExpenseRows.map((e) => (
                      <li key={e.name} className="flex justify-between gap-2">
                        <span className="text-black/70 dark:text-white/70">{e.name}</span>
                        <span>{formatCents(e.cents)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>

          <Card title="Party balances">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-black/50 dark:text-white/50">
                  You&apos;ll receive
                </p>
                <p className="mb-1 text-xl font-semibold text-[#0ca30c]">
                  {formatCents(totalReceivable)}
                </p>
                {overdueReceivable > 0 && (
                  <p className="mb-2 text-xs font-medium text-[#d03b3b]">
                    {formatCents(overdueReceivable)} overdue ({OVERDUE_DAYS}+ days)
                  </p>
                )}
                <ul className="flex flex-col gap-1.5 text-sm">
                  {receivable.slice(0, 3).map((p) => {
                    const overdue = (p.overdueDays ?? 0) > OVERDUE_DAYS;
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-black/70 dark:text-white/70">{p.name}</span>
                          {overdue && (
                            <span className="shrink-0 rounded-full bg-[#d03b3b]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#d03b3b]">
                              {p.overdueDays}d overdue
                            </span>
                          )}
                        </span>
                        <span className="shrink-0">{formatCents(p.balanceCents)}</span>
                      </li>
                    );
                  })}
                  {receivable.length === 0 && (
                    <li className="text-black/50 dark:text-white/50">Nothing outstanding.</li>
                  )}
                </ul>
                {receivable.length > 3 && (
                  <Link href="/parties" className="mt-2 block text-sm underline underline-offset-4">
                    +{receivable.length - 3} more
                  </Link>
                )}
              </div>

              <div>
                <p className="mb-1 text-xs font-medium text-black/50 dark:text-white/50">
                  You&apos;ll pay
                </p>
                <p className="mb-1 text-xl font-semibold text-[#d03b3b]">
                  {formatCents(totalPayable)}
                </p>
                {overduePayable > 0 && (
                  <p className="mb-2 text-xs font-medium text-[#d03b3b]">
                    {formatCents(overduePayable)} overdue ({OVERDUE_DAYS}+ days)
                  </p>
                )}
                <ul className="flex flex-col gap-1.5 text-sm">
                  {payable.slice(0, 3).map((p) => {
                    const overdue = (p.overdueDays ?? 0) > OVERDUE_DAYS;
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-black/70 dark:text-white/70">{p.name}</span>
                          {overdue && (
                            <span className="shrink-0 rounded-full bg-[#d03b3b]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#d03b3b]">
                              {p.overdueDays}d overdue
                            </span>
                          )}
                        </span>
                        <span className="shrink-0">{formatCents(-p.balanceCents)}</span>
                      </li>
                    );
                  })}
                  {payable.length === 0 && (
                    <li className="text-black/50 dark:text-white/50">Nothing outstanding.</li>
                  )}
                </ul>
                {payable.length > 3 && (
                  <Link href="/parties" className="mt-2 block text-sm underline underline-offset-4">
                    +{payable.length - 3} more
                  </Link>
                )}
              </div>
            </div>
          </Card>

          <Card
            title="Today's purchases"
            action={
              <span className="text-sm font-medium text-[#d03b3b]">
                {formatCents(todayPurchaseTotalCents)}
              </span>
            }
          >
            {todayPurchases.length === 0 ? (
              <p className="text-sm text-black/50 dark:text-white/50">No purchases today.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-black/60 dark:text-white/60">
                    <tr>
                      <th className="py-1.5 pr-2">Party</th>
                      <th className="py-1.5 pr-2">Item</th>
                      <th className="py-1.5 pr-2 text-center">Weight</th>
                      <th className="py-1.5 pr-2">Rate</th>
                      <th className="py-1.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayPurchases.map((purchase) => {
                      const status = paidStatus(purchase.totalCents, purchase.paidCents);
                      return (
                        <tr key={purchase.id} className={STATUS_ROW_BG[status]}>
                          <td className="py-2 pr-2">
                            <span className="flex items-center gap-2">
                              <span
                                className="h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{ background: STATUS_DOT[status] }}
                              />
                              <span className="truncate font-medium">
                                {purchase.party?.name ?? "No party"}
                              </span>
                            </span>
                            <span className="block pl-3.5 text-xs text-black/50 dark:text-white/50">
                              {STATUS_LABEL[status]}
                            </span>
                          </td>
                          <td className="py-2 pr-2">
                            <div className="flex flex-col gap-0.5">
                              {purchase.items.map((l) => (
                                <span key={l.id}>{l.item.name}</span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 pr-2 text-center">
                            <div className="flex flex-col gap-0.5">
                              {purchase.items.map((l) => (
                                <span key={l.id}>{l.quantity}</span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 pr-2">
                            <div className="flex flex-col gap-0.5">
                              {purchase.items.map((l) => (
                                <span key={l.id}>{formatCents(l.priceCents)}</span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 text-right font-medium">
                            {formatCents(purchase.totalCents)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Stock Inventory">
            <div className="flex flex-col gap-4 text-sm">
              <Meter
                label="Stock health"
                valueLabel={`${itemsWithStock.length - lowStockItems.length}/${itemsWithStock.length} healthy`}
                ratio={stockHealthRatio}
                severity={severityFor(stockHealthRatio)}
              />
              <div className="flex justify-between">
                <span className="text-black/60 dark:text-white/60">Stock value</span>
                <span className="font-medium">{formatCents(stockValueCents)}</span>
              </div>
              <div>
                <p className="mb-1 text-black/60 dark:text-white/60">Low stocks</p>
                {lowStockItems.length === 0 ? (
                  <p className="text-black/50 dark:text-white/50">None of your items have low stock.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {lowStockItems.map((item) => (
                      <li key={item.id} className="flex justify-between text-[#d03b3b]">
                        <span>{item.name}</span>
                        <span>
                          {item.currentStockQty} {item.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          <Card
            title="All Stock"
            action={
              <Link href="/items" className="text-sm underline underline-offset-4">
                Items
              </Link>
            }
          >
            {allStock.length === 0 ? (
              <p className="text-sm text-black/50 dark:text-white/50">No items yet.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white/80 text-left text-xs text-black/50 backdrop-blur dark:bg-[#1e2231]/80 dark:text-white/50">
                    <tr>
                      <th className="py-1.5 pr-2 font-medium">Item</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Stock</th>
                      <th className="py-1.5 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allStock.map((item) => (
                      <tr
                        key={item.id}
                        className={`border-t border-black/5 dark:border-white/5 ${item.low ? "text-[#d03b3b]" : ""}`}
                      >
                        <td className="py-1.5 pr-2">{item.name}</td>
                        <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                          {item.qtyLabel} {displayUnit(item.unit)}
                        </td>
                        <td className="py-1.5 text-right whitespace-nowrap text-black/60 dark:text-white/60">
                          {formatCents(item.valueCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card
            title="Cash & Bank"
            action={
              <Link href="/accounts" className="text-sm underline underline-offset-4">
                Accounts
              </Link>
            }
          >
            <div className="flex flex-col gap-3 text-sm">
              {visibleAccounts.map((a) => {
                const Icon = a.type === "CASH" ? Banknote : Landmark;
                return (
                  <div key={a.id} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-black/60 dark:text-white/60">
                      <Icon size={15} className="shrink-0 text-brand" />
                      <span className="truncate">{a.name}</span>
                    </span>
                    <span
                      className={`shrink-0 font-medium ${a.balanceCents < 0 ? "text-[#d03b3b]" : ""}`}
                    >
                      {formatCents(a.balanceCents)}
                    </span>
                  </div>
                );
              })}
              <div className="flex justify-between border-t border-black/10 pt-2 font-semibold dark:border-white/10">
                <span>Total available</span>
                <span>{formatCents(totalAvailableCents)}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
