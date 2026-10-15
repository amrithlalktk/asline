"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  Truck,
  Wallet,
  Receipt,
  BarChart2,
  Tags,
  UserCog,
  Upload,
  Table2,
  AtSign,
  Landmark,
  HandCoins,
  CalendarClock,
  ChevronDown,
  History as HistoryIcon,
  ReceiptText,
  X,
} from "lucide-react";
import type { SessionPayload } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import Logo from "@/components/Logo";

const LINKS = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, adminOnly: false },
  { href: "/parties", label: "Parties", icon: Users, adminOnly: false },
  { href: "/items", label: "Items", icon: Package, adminOnly: false },
  { href: "/sale", label: "Sale", icon: ShoppingCart, adminOnly: false },
  { href: "/purchase", label: "Purchase", icon: Truck, adminOnly: false },
  { href: "/payments", label: "Payments", icon: Wallet, adminOnly: false },
  { href: "/expenses", label: "Expenses", icon: Receipt, adminOnly: false },
  { href: "/reports", label: "Reports", icon: BarChart2, adminOnly: false },
  { href: "/notes", label: "Notes", icon: Table2, adminOnly: false },
  { href: "/email-contacts", label: "Email Contacts", icon: AtSign, adminOnly: false },
  { href: "/accounts", label: "Accounts", icon: Landmark, adminOnly: true },
  { href: "/capital", label: "Partners & Capital", icon: HandCoins, adminOnly: true },
  { href: "/import", label: "Import", icon: Upload, adminOnly: true },
  { href: "/categories", label: "Categories", icon: Tags, adminOnly: true },
  { href: "/users", label: "Users", icon: UserCog, adminOnly: true },
];

// Links that open as a dropdown group instead of navigating directly —
// `tab` is the ?tab= value that page uses (null = its default tab).
const SUB_LINKS: Record<
  string,
  { href: string; label: string; icon: typeof CalendarClock; tab: string | null }[]
> = {
  "/sale": [
    { href: "/sale", label: "Sales", icon: ReceiptText, tab: null },
    { href: "/sale?tab=forward", label: "Forward sales", icon: CalendarClock, tab: "forward" },
  ],
  "/accounts": [
    { href: "/accounts", label: "Accounts", icon: Landmark, tab: null },
    { href: "/accounts/history", label: "Transaction history", icon: HistoryIcon, tab: null },
  ],
};

// Fixed and always visible on desktop (md+); on narrower screens it's an
// off-canvas drawer toggled from TopBar's hamburger button, since a
// permanently-docked 224px rail would eat over half of a phone screen.
export default function Sidebar({
  session,
  mobileOpen,
  onClose,
}: {
  session: SessionPayload;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  // Which dropdown groups are open — a group starts open while you're in it.
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(Object.keys(SUB_LINKS).filter((href) => pathname.startsWith(href)))
  );
  useEffect(() => {
    const current = Object.keys(SUB_LINKS).find((href) => pathname.startsWith(href));
    if (current) setOpenGroups((prev) => (prev.has(current) ? prev : new Set(prev).add(current)));
  }, [pathname]);
  function toggleGroup(href: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  // Any navigation (tapping a link) should close the mobile drawer — on
  // desktop this is a no-op since the drawer transform is overridden there.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Escape closes the drawer, and the page behind it shouldn't scroll while
  // it's open — only wired up while it's actually open (mobile only; on
  // desktop mobileOpen never becomes true since there's no hamburger to
  // trigger it).
  useEffect(() => {
    if (!mobileOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen, onClose]);

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-20 bg-black/40 md:hidden print:hidden"
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex h-screen w-64 shrink-0 flex-col border-r border-black/10 bg-canvas/95 text-black/70 shadow-[8px_0_30px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-transform duration-200 ease-in-out print:hidden md:w-56 md:translate-x-0 md:bg-canvas/70 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="text-black/40 hover:text-black md:hidden"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
          {LINKS.filter((l) => !l.adminOnly || isAdminRole(session.role)).map((link) => {
            const Icon = link.icon;
            const subs = SUB_LINKS[link.href];
            const inSection = pathname.startsWith(link.href);
            if (!subs) {
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm backdrop-blur-sm transition-colors ${
                    inSection
                      ? "bg-brand/85 font-medium text-white"
                      : "hover:bg-black/5 hover:text-black"
                  }`}
                >
                  <Icon size={18} strokeWidth={2} />
                  {link.label}
                </Link>
              );
            }
            const open = openGroups.has(link.href);
            // The sub-page whose path (and ?tab=) matches the current URL.
            const pathOf = (href: string) => href.split("?")[0];
            const activeSub = inSection
              ? (subs.find((s) => pathOf(s.href) === pathname && s.tab === tab) ??
                subs.find((s) => pathOf(s.href) === pathname && s.tab === null))
              : undefined;
            return (
              <div key={link.href} className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(link.href)}
                  aria-expanded={open}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm backdrop-blur-sm transition-colors ${
                    inSection && !open
                      ? "bg-brand/85 font-medium text-white"
                      : inSection
                        ? "font-medium text-brand hover:bg-black/5"
                        : "hover:bg-black/5 hover:text-black"
                  }`}
                >
                  <Icon size={18} strokeWidth={2} />
                  {link.label}
                  <ChevronDown
                    size={16}
                    className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>
                {open && subs.map((s) => {
                  const SubIcon = s.icon;
                  const subActive = activeSub?.href === s.href;
                  return (
                    <Link
                      key={s.href}
                      href={s.href}
                      className={`ml-6 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                        subActive
                          ? "bg-brand/85 font-medium text-white"
                          : "hover:bg-black/5 hover:text-black"
                      }`}
                    >
                      <SubIcon size={15} strokeWidth={2} />
                      {s.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-black/10 px-5 py-4 text-xs">
          <span className="text-black">{session.name}</span>
          <div className="text-black/40">{session.role}</div>
          <div className="mt-2 flex gap-3">
            <Link
              href="/account"
              className={`underline-offset-2 hover:underline ${
                pathname.startsWith("/account") ? "text-black" : "text-black/40"
              }`}
            >
              Account
            </Link>
            <Link
              href="/about"
              className={`underline-offset-2 hover:underline ${
                pathname.startsWith("/about") ? "text-black" : "text-black/40"
              }`}
            >
              About
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
