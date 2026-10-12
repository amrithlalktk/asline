"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, ChevronDown, LogOut, Menu } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

export default function TopBar({
  menuOpen,
  onMenuClick,
}: {
  menuOpen: boolean;
  onMenuClick: () => void;
}) {
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!moreOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [moreOpen]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 flex items-center justify-end border-b border-white/40 bg-white/50 px-4 py-3 backdrop-blur-xl print:hidden sm:px-6 dark:border-white/5 dark:bg-[#161927]/60">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        aria-expanded={menuOpen}
        className="mr-auto text-black/60 md:hidden dark:text-white/60"
      >
        <Menu size={22} />
      </button>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={() => router.push("/sale?new=1")}
          className="flex items-center gap-1.5 rounded-full bg-brand px-3 py-2 text-sm font-medium text-white hover:opacity-90 sm:px-4"
        >
          <Plus size={16} /> <span className="hidden sm:inline">Add Sale</span>
        </button>
        <button
          onClick={() => router.push("/purchase?new=1")}
          className="flex items-center gap-1.5 rounded-full bg-[#2a78d6] px-3 py-2 text-sm font-medium text-white hover:opacity-90 sm:px-4"
        >
          <Plus size={16} /> <span className="hidden sm:inline">Add Purchase</span>
        </button>
        <div className="relative">
          <button
            onClick={() => setMoreOpen((v) => !v)}
            onBlur={() => setTimeout(() => setMoreOpen(false), 150)}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            className="flex items-center gap-1.5 rounded-full border border-[#2a78d6] px-3 py-2 text-sm font-medium text-[#2a78d6] hover:bg-[#2a78d6]/5 sm:px-4"
          >
            <Plus size={16} /> <span className="hidden sm:inline">Add More</span>{" "}
            <ChevronDown size={14} />
          </button>
          {moreOpen && (
            <div
              role="menu"
              className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-white/50 bg-white/80 py-1 text-sm shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-[#1e2231]/80"
            >
              {[
                { label: "Expense", href: "/expenses?new=1" },
                { label: "Item", href: "/items?new=1" },
                { label: "Party", href: "/parties?new=1" },
              ].map((opt) => (
                <button
                  key={opt.href}
                  role="menuitem"
                  onClick={() => router.push(opt.href)}
                  className="block w-full px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <ThemeToggle className="ml-1 sm:ml-2" />
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10"
          title="Log out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
