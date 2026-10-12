import Card from "@/components/Card";

export default function BalanceSheetPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Balance Sheet</h1>
      <Card>
        <p className="text-sm text-black/60 dark:text-white/60">
          Not available yet — a real balance sheet needs assets, liabilities, and equity
          tracked as their own ledger, which this app doesn&apos;t model today (it only
          tracks sales, purchases, expenses, and party balances). Building this out would
          be a data-modeling project on its own, not just a new report page.
        </p>
      </Card>
    </div>
  );
}
