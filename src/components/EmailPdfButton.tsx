"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Candidate = { label: string; email: string; tag: string };

const PANEL_WIDTH = 288; // matches w-72

// One-click became "search saved addresses and pick who gets this PDF" —
// candidates are pooled from three saved sources: each Party's own email,
// the standalone Email Contacts directory, and the viewer's own configured
// notification addresses (see /api/auth/me, /api/parties, /api/email-contacts).
// The endpoint does the actual PDF build + send; this only resolves who to
// send it to and calls it.
//
// The panel is portaled to <body> with position:fixed (like SuggestInput and
// RecordPaymentForm's bill search) rather than rendered inline — this button
// is used inside BillPreviewModal's scrollable body, and an inline `absolute`
// panel would get clipped by that container's `overflow-y-auto` the moment
// it needed to extend past the visible scroll area.
export default function EmailPdfButton({
  endpoint,
  body,
  disabled,
  className,
  defaultRecipient,
  label = "Email PDF",
  hideTrigger = false,
  anchorEl,
  onClose,
}: {
  endpoint: string;
  body?: Record<string, unknown> | null;
  disabled?: boolean;
  className?: string;
  /** Pre-checked in the picker — typically the bill's own party, if it has an email saved. */
  defaultRecipient?: { name: string; email: string } | null;
  // Button text — shorter ("Email") on list rows.
  label?: string;
  // Opened from another control (e.g. a row's More menu): no button of its
  // own, starts open, positioned off `anchorEl`, and reports when it closes.
  hideTrigger?: boolean;
  anchorEl?: HTMLElement | null;
  onClose?: () => void;
}) {
  const [open, setOpenState] = useState(hideTrigger);
  // Stable setter that also tells the opener when the panel closes.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const setOpen = useCallback((next: boolean | ((o: boolean) => boolean)) => {
    setOpenState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      if (prev && !value) setTimeout(() => onCloseRef.current?.(), 0);
      return value;
    });
  }, []);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || loaded) return;
    Promise.all([
      fetch("/api/parties").then((r) => r.json()),
      fetch("/api/email-contacts").then((r) => r.json()),
      fetch("/api/auth/me").then((r) => r.json()),
    ]).then(([parties, contacts, me]) => {
      const fromParties: Candidate[] = (parties as { name: string; email: string | null }[])
        .filter((p) => p.email)
        .map((p) => ({ label: p.name, email: p.email as string, tag: "Party" }));
      const fromContacts: Candidate[] = (contacts as { name: string; email: string }[]).map(
        (c) => ({ label: c.name, email: c.email, tag: "Contact" })
      );
      const fromMe: Candidate[] = ((me.notifyEmails as string | null) ?? "")
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
        .map((email) => ({ label: "Me", email, tag: "Me" }));

      const byEmail = new Map<string, Candidate>();
      for (const c of [...fromParties, ...fromContacts, ...fromMe]) {
        const key = c.email.toLowerCase();
        if (!byEmail.has(key)) byEmail.set(key, c);
      }
      setCandidates([...byEmail.values()].sort((a, b) => a.label.localeCompare(b.label)));
      setLoaded(true);
    });
  }, [open, loaded]);

  useEffect(() => {
    if (defaultRecipient?.email) {
      setSelected((prev) => new Set(prev).add(defaultRecipient.email.toLowerCase()));
    }
  }, [defaultRecipient?.email]);

  // Position the portaled panel off the button, right-aligned like before,
  // but clamped so it never runs off either edge of a narrow viewport.
  useEffect(() => {
    if (!open) return;
    function updatePosition() {
      const el = anchorEl ?? buttonRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8));
      setRect({ top: r.bottom + 4, left });
    }
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, anchorEl]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, anchorEl, setOpen]);

  function toggle(email: string) {
    const key = email.toLowerCase();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSend() {
    if (selected.size === 0) return;
    setState("sending");
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, to: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not send email");
        setState("error");
        return;
      }
      setState("sent");
      setOpen(false);
    } catch {
      setError("Could not send email");
      setState("error");
    }
  }

  const q = search.trim().toLowerCase();
  const visible = q
    ? candidates.filter((c) => c.label.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    : candidates;
  // The default recipient shows even before any candidates have loaded, so
  // it's always available to send to without waiting on a fetch.
  const defaultShown =
    defaultRecipient?.email &&
    !visible.some((c) => c.email.toLowerCase() === defaultRecipient.email.toLowerCase())
      ? [{ label: defaultRecipient.name, email: defaultRecipient.email, tag: "Party" }]
      : [];
  const rows = [...defaultShown, ...visible];

  return (
    <>
      {!hideTrigger && (
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setState("idle");
          setOpen((o) => !o);
        }}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={
          className ??
          "rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-40 dark:border-white/15"
        }
      >
        {state === "sent" ? "Sent ✓" : label}
      </button>
      )}

      {mounted &&
        open &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Choose email recipients"
            style={{ position: "fixed", top: rect.top, left: rect.left, width: PANEL_WIDTH }}
            className="z-40 rounded-md border border-black/15 bg-white p-2 shadow-lg dark:border-white/15 dark:bg-[#1e2231]"
          >
            <input
              autoFocus
              placeholder="Search saved emails…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-2 w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
            />
            <div className="max-h-48 overflow-y-auto">
              {!loaded ? (
                <p className="px-1 py-2 text-xs text-black/50 dark:text-white/50">Loading…</p>
              ) : rows.length === 0 ? (
                <p className="px-1 py-2 text-xs text-black/50 dark:text-white/50">
                  No saved emails match. Add one under Parties or Email Contacts.
                </p>
              ) : (
                rows.map((c) => (
                  <label
                    key={c.email}
                    className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(c.email.toLowerCase())}
                      onChange={() => toggle(c.email)}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {c.label}{" "}
                      <span className="text-xs text-black/50 dark:text-white/50">{c.email}</span>
                    </span>
                    <span className="shrink-0 text-[10px] uppercase text-black/30 dark:text-white/30">
                      {c.tag}
                    </span>
                  </label>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={handleSend}
              disabled={selected.size === 0 || state === "sending"}
              className="mt-2 w-full rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {state === "sending" ? "Sending…" : `Send to ${selected.size || ""}`.trim()}
            </button>
            {state === "error" && error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </div>,
          document.body
        )}
    </>
  );
}
