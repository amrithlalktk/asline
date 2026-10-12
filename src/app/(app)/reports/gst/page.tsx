import Card from "@/components/Card";

export default function GstReturnsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">GST Returns</h1>
      <Card>
        <p className="text-sm text-black/60 dark:text-white/60">
          Not available yet — GSTR-1/3B and similar filings follow strict government-defined
          schemas (HSN codes, place of supply, rate-wise breakdowns) that this app&apos;s
          generic per-item tax % doesn&apos;t capture. The Sale &amp; Purchase report&apos;s
          &quot;Tax amount only&quot; view covers a basic tax breakdown in the meantime.
        </p>
      </Card>
    </div>
  );
}
