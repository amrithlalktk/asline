import { BRAND } from "@/lib/brand";

// The AS LINE mark: a bold "A" crossed by an amber line that runs past its
// legs. `plain` drops the tile and draws the strokes in one color, for the
// faint background watermark.
export default function LogoMark({
  size = 32,
  plain = false,
  className,
}: {
  size?: number;
  plain?: boolean;
  className?: string;
}) {
  const fg = plain ? BRAND.color : "#ffffff";
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      className={className}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {!plain && <rect width="24" height="24" rx="6" fill={BRAND.color} />}
      <path d="M6.5 18 L12 5.5 L17.5 18" stroke={fg} strokeWidth={plain ? 1.5 : 2.4} />
      <path d="M3.5 13.5 H20.5" stroke={plain ? BRAND.color : BRAND.accent} strokeWidth={plain ? 1.5 : 2.4} />
    </svg>
  );
}
