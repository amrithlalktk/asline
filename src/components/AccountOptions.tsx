"use client";

import type { Account } from "@/lib/types";

// The <option>s for any "paid via" picker: every active account, plus the
// currently-selected one even if it's since been hidden (editing an old
// payment shouldn't silently switch its account).
export default function AccountOptions({
  accounts,
  current,
}: {
  accounts: Account[];
  current?: string | null;
}) {
  const visible = accounts.filter((a) => a.active || a.id === current);
  if (visible.length === 0 && current) {
    // Still loading — keep the selected value representable.
    return <option value={current}>{current === "CASH" ? "Cash" : "…"}</option>;
  }
  return (
    <>
      {visible.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </>
  );
}
