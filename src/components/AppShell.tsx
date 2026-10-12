"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import Watermark from "@/components/Watermark";
import type { SessionPayload } from "@/lib/auth";

// Sidebar and TopBar need to share one bit of state (is the mobile drawer
// open) but are otherwise independent — this just wires that up so
// layout.tsx itself can stay a plain async server component.
export default function AppShell({
  session,
  children,
}: {
  session: SessionPayload;
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar session={session} mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      {/* Sidebar is fixed (so its glass blur has scrolled content to pick
          up), so this pane needs matching left margin instead of relying
          on flex layout to make room for it — only from md up, since on
          narrower screens the sidebar is an off-canvas drawer, not docked. */}
      {/* `isolate` is required, not decorative — without it this element
          never actually establishes its own stacking context (position:
          relative alone doesn't, absent an explicit z-index), so the
          Watermark's negative z-index escapes to the document root instead
          of just going behind this pane's own content. */}
      <div className="isolate relative flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas print:ml-0 print:overflow-visible print:bg-white md:ml-56 dark:bg-[#12141f]">
        {/* Soft, blurred color fields with nothing else behind them — the
            point is to give the glass Cards/TopBar something colorful to
            blur, since a backdrop-blur over a flat background is invisible.
            Screen-only: printed pages should be plain white (see Card). */}
        <div className="pointer-events-none absolute -left-24 -top-24 -z-10 h-80 w-80 rounded-full bg-brand/25 blur-3xl print:hidden" />
        <div className="pointer-events-none absolute right-0 top-1/3 -z-10 h-96 w-96 rounded-full bg-[#2a78d6]/20 blur-3xl print:hidden" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 -z-10 h-72 w-72 rounded-full bg-accent/15 blur-3xl print:hidden" />
        <Watermark />
        <TopBar menuOpen={mobileNavOpen} onMenuClick={() => setMobileNavOpen(true)} />
        <main className="mx-auto w-full flex-1 px-4 py-4 print:overflow-visible print:px-0 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
