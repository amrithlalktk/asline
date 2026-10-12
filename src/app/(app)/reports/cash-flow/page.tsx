import Card from "@/components/Card";

export default function CashFlowPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Cash Flow</h1>
      <Card>
        <p className="text-sm text-black/60 dark:text-white/60">
          Not available yet — a proper cash flow statement (operating/investing/financing
          activities) needs a level of transaction categorization this app doesn&apos;t do
          today. The Dashboard&apos;s &quot;Cash &amp; Bank&quot; card and the Day Book report
          cover the simpler day-to-day view in the meantime.
        </p>
      </Card>
    </div>
  );
}
