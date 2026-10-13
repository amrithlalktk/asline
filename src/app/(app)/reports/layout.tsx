"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Receipt,
  ShoppingCart,
  CalendarDays,
  BadgePercent,
  TrendingUp,
  Users,
  Landmark,
  Wallet,
  FileSpreadsheet,
  FileSearch,
} from "lucide-react";

const GROUPS = [
  {
    title: "Transaction reports",
    links: [
      { href: "/reports/sales-purchases", label: "Sale & Purchase", icon: ShoppingCart },
      { href: "/reports/bill", label: "Bill Report", icon: FileSearch },
      { href: "/reports/day-book", label: "Day Book", icon: CalendarDays },
      { href: "/reports/expenses", label: "Expenses", icon: Receipt },
      { href: "/reports/bill-wise-profit", label: "Bill Wise Profit", icon: BadgePercent },
      { href: "/reports/profit-loss", label: "Profit & Loss", icon: TrendingUp },
      { href: "/reports/balance-sheet", label: "Balance Sheet", icon: Landmark },
    ],
  },
  {
    title: "Party reports",
    links: [{ href: "/parties", label: "Party Statement", icon: Users }],
  },
  {
    title: "Coming soon",
    links: [
      { href: "/reports/cash-flow", label: "Cash Flow", icon: Wallet },
      { href: "/reports/gst", label: "GST Returns", icon: FileSpreadsheet },
    ],
  },
];

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const flatLinks = GROUPS.flatMap((g) => g.links);

  return (
    <div className="flex flex-1 flex-col gap-4 md:flex-row">
      {/* Compact horizontal scroller below md — the full grouped list (9
          links across 3 headed sections) would otherwise push the actual
          report far down the page before you ever see it on a phone. */}
      <nav className="flex gap-2 overflow-x-auto pb-1 print:hidden md:hidden">
        {flatLinks.map((link) => {
          const Icon = link.icon;
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "border-transparent bg-brand/85 font-medium text-white"
                  : "border-black/10 text-black/70 hover:bg-black/5 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/10"
              }`}
            >
              <Icon size={14} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <aside className="hidden w-56 shrink-0 rounded-2xl border border-white/50 bg-white/55 p-3 backdrop-blur-xl print:hidden md:block dark:border-white/10 dark:bg-[#1e2231]/60">
        {GROUPS.map((group) => (
          <div key={group.title} className="mb-4 last:mb-0">
            <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
              {group.title}
            </p>
            <nav className="flex flex-col gap-0.5">
              {group.links.map((link) => {
                const Icon = link.icon;
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                      active
                        ? "bg-brand/85 font-medium text-white"
                        : "text-black/70 hover:bg-black/5 hover:text-black dark:text-white/70 dark:hover:bg-white/10"
                    }`}
                  >
                    <Icon size={16} />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
