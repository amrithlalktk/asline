export default function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-[#0ca30c]"
      : tone === "negative"
        ? "text-[#d03b3b]"
        : "";

  return (
    <div className="rounded-2xl border border-white/50 bg-white/55 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-xl print:border-black/20 print:bg-white print:shadow-none print:backdrop-blur-none dark:border-white/10 dark:bg-[#1e2231]/60 dark:shadow-none">
      <p className="text-sm text-black/60 dark:text-white/60">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
