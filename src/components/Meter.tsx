// A ratio-against-a-limit indicator — deliberately not a donut/pie (the
// dataviz skill flags 2-slice pies as an anti-pattern; a meter reads the
// same ratio faster and scales better in a dense card).
const SEVERITY = {
  good: { fill: "#0ca30c", track: "rgba(12,163,12,0.15)" },
  warning: { fill: "#fab219", track: "rgba(250,178,25,0.18)" },
  critical: { fill: "#d03b3b", track: "rgba(208,59,59,0.15)" },
};

export default function Meter({
  label,
  valueLabel,
  ratio,
  severity,
}: {
  label: string;
  valueLabel: string;
  /** 0..1 */
  ratio: number;
  severity: "good" | "warning" | "critical";
}) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const { fill, track } = SEVERITY[severity];

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-black/60 dark:text-white/60">{label}</span>
        <span className="font-medium">{valueLabel}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: track }}>
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${clamped * 100}%`, background: fill }}
        />
      </div>
    </div>
  );
}
