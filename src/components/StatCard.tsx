import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import Card from "@/components/Card";

export default function StatCard({
  label,
  value,
  icon: Icon,
  iconClassName = "bg-black/5 text-black/60 dark:bg-white/10 dark:text-white/70",
  delta,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  iconClassName?: string;
  /** Percent change vs. the previous period. Positive isn't always "good" —
   * pass isGoodWhenUp: false for a metric like Expenses where up is bad. */
  delta?: { percent: number; isGoodWhenUp: boolean };
}) {
  const deltaIsGood = delta ? (delta.percent >= 0) === delta.isGoodWhenUp : null;

  return (
    <Card>
      <div className="flex items-start justify-between">
        <p className="text-sm text-black/60 dark:text-white/60">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-full ${iconClassName}`}>
          <Icon size={16} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {delta && (
        <p
          className={`mt-1 flex items-center gap-1 text-xs ${
            deltaIsGood ? "text-[#0ca30c]" : "text-[#d03b3b]"
          }`}
        >
          {delta.percent >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {Math.abs(delta.percent).toFixed(0)}%
          <span className="text-black/40 dark:text-white/40">vs last month</span>
        </p>
      )}
    </Card>
  );
}
