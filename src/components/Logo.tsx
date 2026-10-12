import LogoMark from "@/components/LogoMark";

// AS LINE — the "A + line" mark on a violet tile, paired with a two-tone
// wordmark.
export default function Logo({
  showText = true,
  iconSize = 32,
}: {
  showText?: boolean;
  iconSize?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <LogoMark size={iconSize} className="shrink-0" />
      {showText && (
        <span className="text-base font-bold tracking-wide">
          <span className="text-black">AS</span>{" "}
          <span className="text-brand">LINE</span>
        </span>
      )}
    </div>
  );
}
