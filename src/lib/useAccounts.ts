"use client";

import { useEffect, useState } from "react";
import type { Account } from "@/lib/types";

// One fetch per page load shared by every payment picker on the page.
// Call invalidateAccounts() after adding/editing an account so the next
// picker to mount sees the change.
let cached: Promise<Account[]> | null = null;

function loadAccounts() {
  cached ??= fetch("/api/accounts")
    .then((res) => (res.ok ? res.json() : []))
    .catch(() => {
      cached = null;
      return [];
    });
  return cached;
}

export function invalidateAccounts() {
  cached = null;
}

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  useEffect(() => {
    let alive = true;
    loadAccounts().then((list) => {
      if (alive) setAccounts(list);
    });
    return () => {
      alive = false;
    };
  }, []);
  return accounts;
}
