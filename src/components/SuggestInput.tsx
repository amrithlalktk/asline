"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A text input with a suggestion list we draw and style ourselves — unlike
// a native <input list> datalist, whose popup is drawn by the OS/browser
// chrome and can't be recolored past `color-scheme`.
//
// The list is rendered into a portal on <body> instead of inline: Card
// applies `backdrop-blur`, which (like `transform`/`filter`) creates a new
// CSS stacking context for its subtree. An absolutely-positioned dropdown
// trapped inside that context can never out-rank a *later* sibling Card
// (e.g. a summary tile or results table below it) no matter how high its
// z-index goes, since the whole first Card is compared to the whole second
// Card as one paint unit. Portaling to `document.body` sidesteps that
// entirely — the list is no longer a descendant of anything that could trap
// it, so it always paints above the rest of the page.
export default function SuggestInput({
  value,
  onChange,
  onSelect,
  options,
  placeholder,
  onBlur,
  onKeyDown,
  className,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  options: string[];
  placeholder?: string;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  // Our own handle on the element, captured from event targets rather than
  // merged with `inputRef` — that prop may belong to the caller (see
  // QuickEntryRow), and writing to a ref object we don't own ourselves
  // isn't allowed. Reading position off it here is purely internal.
  const elRef = useRef<HTMLInputElement | null>(null);

  const trimmed = value.trim().toLowerCase();
  const filtered = trimmed ? options.filter((o) => o.toLowerCase().includes(trimmed)) : options;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function updatePosition() {
      const el = elRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom, left: r.left, width: r.width });
    }
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          elRef.current = e.currentTarget;
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          elRef.current = e.currentTarget;
          setOpen(true);
        }}
        onBlur={() => {
          // Delay so a suggestion's onClick still fires before we hide the
          // list — a plain blur would close it first and swallow the click.
          window.setTimeout(() => setOpen(false), 150);
          onBlur?.();
        }}
        onKeyDown={onKeyDown}
        className={className}
      />
      {mounted &&
        open &&
        filtered.length > 0 &&
        rect &&
        createPortal(
          <ul
            style={{ position: "fixed", top: rect.top + 4, left: rect.left, width: rect.width }}
            className="z-40 max-h-60 overflow-auto rounded-md border border-black/10 bg-white py-1 text-sm shadow-lg dark:border-white/10 dark:bg-[#1e2231]"
          >
            {filtered.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(name);
                    onSelect?.(name);
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}
