"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import EmailPdfButton from "@/components/EmailPdfButton";

// Shared look for the buttons on bill rows.
export const rowButton =
  "inline-flex items-center gap-1 rounded-md border border-black/15 px-2 py-1 text-xs font-medium whitespace-nowrap hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10";
export const rowButtonPrimary =
  "inline-flex items-center gap-1 rounded-md bg-brand px-2 py-1 text-xs font-medium whitespace-nowrap text-white hover:opacity-90";

const MENU_WIDTH = 176;

// Just below the More button, right-aligned to it, kept on screen.
function menuPosition(button: HTMLElement | null) {
  const r = button?.getBoundingClientRect();
  if (!r) return null;
  return {
    top: r.bottom + 4,
    left: Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
  };
}

export type RowMenuItem = {
  label: string;
  // Opens in a new tab (print pages).
  href?: string;
  // Gets the More button so a popover (e.g. email) can anchor to it.
  onSelect?: (anchor: HTMLElement) => void;
  danger?: boolean;
  hidden?: boolean;
};

// A bill row's actions: the main buttons (`children`) always visible, the
// rest tucked into a "More" dropdown. The menu is portaled with fixed
// positioning so a scrolling table can't clip it.
export default function RowActions({ items, children }: { items: RowMenuItem[]; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const visible = items.filter((i) => !i.hidden);

  useEffect(() => {
    if (!open) return;
    const place = () => setPos(menuPosition(buttonRef.current));
    function outside(e: MouseEvent) {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <span className="inline-flex items-center justify-end gap-1">
      {children}
      {visible.length > 0 && (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            // Place it before opening so it appears in the right spot at once.
            setPos(menuPosition(buttonRef.current));
            setOpen((o) => !o);
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          className={rowButton}
        >
          More <ChevronDown size={13} className={open ? "rotate-180" : ""} />
        </button>
      )}
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="z-40 flex flex-col overflow-hidden rounded-md border border-black/15 bg-white py-1 text-sm shadow-lg dark:border-white/15 dark:bg-[#1e2231]"
          >
            {visible.map((item) =>
              item.href ? (
                <a
                  key={item.label}
                  role="menuitem"
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {item.label}
                </a>
              ) : (
                <button
                  key={item.label}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (buttonRef.current) item.onSelect?.(buttonRef.current);
                  }}
                  className={`px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 ${
                    item.danger ? "text-[#d03b3b]" : ""
                  }`}
                >
                  {item.label}
                </button>
              )
            )}
          </div>,
          document.body
        )}
    </span>
  );
}

type EmailTarget = {
  endpoint: string;
  body?: Record<string, unknown> | null;
  defaultRecipient?: { name: string; email: string } | null;
  anchor: HTMLElement;
};

// For a list page: one email popover opened from any row's More → Email.
export function useRowEmail() {
  const [target, setTarget] = useState<(EmailTarget & { key: number }) | null>(null);
  const popover = target ? (
    <EmailPdfButton
      key={target.key}
      endpoint={target.endpoint}
      body={target.body}
      defaultRecipient={target.defaultRecipient}
      hideTrigger
      anchorEl={target.anchor}
      onClose={() => setTarget(null)}
    />
  ) : null;
  return { emailPopover: popover, openEmail: (t: EmailTarget) => setTarget({ ...t, key: Date.now() }) };
}
