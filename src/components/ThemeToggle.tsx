"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme } from "@/lib/theme";

// Sun/moon button that flips between day and night themes.
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    applyTheme(next ? "dark" : "light");
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Switch to day theme" : "Switch to night theme"}
      aria-label={dark ? "Switch to day theme" : "Switch to night theme"}
      className={`flex items-center justify-center rounded-lg border border-black/10 px-3 py-2 text-sm hover:bg-black/5 ${className}`}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
