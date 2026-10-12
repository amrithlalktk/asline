import {
  Users,
  Package,
  ShoppingCart,
  Truck,
  Wallet,
  Receipt,
  BarChart2,
  Table2,
  Upload,
  UserCog,
  Printer,
  MousePointerClick,
} from "lucide-react";
import Card from "@/components/Card";
import Logo from "@/components/Logo";
import { getCompany } from "@/lib/companyServer";
import BusinessDetailsCard from "@/components/BusinessDetailsCard";

const FEATURES: { icon: typeof Users; title: string; description: string }[] = [
  {
    icon: Users,
    title: "Parties",
    description:
      "Customers and suppliers in one list, each with a running balance, a full statement of every sale/purchase/payment, and advance credit that automatically applies to their next bill.",
  },
  {
    icon: Package,
    title: "Items",
    description: "Your product catalog, with live stock levels computed from every sale and purchase.",
  },
  {
    icon: ShoppingCart,
    title: "Sale",
    description:
      "Record sales fast with spreadsheet-style quick entry, or use advanced entry for multiple items, tax, and extra charges on one bill.",
  },
  {
    icon: Truck,
    title: "Purchase",
    description: "Same fast entry for purchases, with per-item FFA grading and weighted-average cost tracking.",
  },
  {
    icon: Wallet,
    title: "Payments",
    description:
      "Every payment across sales, purchases, and advances in one combined ledger with clear Debit/Credit columns. Overpaying a bill automatically carries the extra as advance credit toward the party's other outstanding bills.",
  },
  {
    icon: Receipt,
    title: "Expenses",
    description: "Track business expenses by category, separate from party transactions.",
  },
  {
    icon: BarChart2,
    title: "Reports",
    description:
      "Day Book, Sales & Purchases, Profit & Loss, Balance Sheet, Cash Flow, GST, Bill-wise Profit, and Expenses — filterable and exportable as CSV or PDF, each with your company details on the header.",
  },
  {
    icon: Table2,
    title: "Notes",
    description:
      "A free-form, Excel-like spreadsheet for anything that doesn't fit the rest of the app — multiple named sheets, formulas (SUM, AVERAGE, and more), all saved automatically.",
  },
  {
    icon: Printer,
    title: "Print & preview",
    description:
      "Printable invoices, purchase bills, and party statements — and a quick popup preview when you click any bill reference, without leaving the page.",
  },
  {
    icon: MousePointerClick,
    title: "Quick entry",
    description:
      "Type a party or item name that doesn't exist yet and it's created on the fly — no separate setup step required to start billing.",
  },
  {
    icon: Upload,
    title: "Import",
    description: "Bring in existing sales and purchases in bulk from a spreadsheet.",
  },
  {
    icon: UserCog,
    title: "Users & roles",
    description:
      "Staff, Admin, and Super Admin roles control who can delete records or manage other users, while everyone can bill and record payments.",
  },
];

export default async function AboutPage() {
  const company = await getCompany();
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Logo />
          </div>
          <span className="text-xs text-black/40 dark:text-white/40">v1.0</span>
        </div>
        <p className="mt-4 max-w-2xl text-sm text-black/70 dark:text-white/70">
          AS LINE is the day-to-day billing, inventory, and accounts system for{" "}
          <strong>{company.name}</strong> — sales and purchases, party balances and advance
          credit, payments, expenses, stock, and reports, all in one place, built to match how
          the business actually works rather than a generic template.
        </p>
      </Card>

      <Card title="Features">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="flex gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon size={16} strokeWidth={2} />
                </div>
                <div>
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="mt-0.5 text-sm text-black/60 dark:text-white/60">
                    {f.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <BusinessDetailsCard initial={company} />
    </div>
  );
}
