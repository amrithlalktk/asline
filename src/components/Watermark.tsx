import LogoMark from "@/components/LogoMark";

// A large, faint brand mark sitting behind page content — purely
// decorative, so it's hidden from assistive tech and never intercepts
// clicks. Negative z-index + a relatively-positioned, overflow-hidden
// parent keeps it behind normal-flow content (cards etc.) while still
// showing through in the empty page background around them.
export default function Watermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -right-24 -bottom-24 -z-10 select-none"
    >
      <LogoMark size={520} plain className="opacity-[0.12]" />
    </div>
  );
}
