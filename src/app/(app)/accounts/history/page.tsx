"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import AccountHistoryCard from "@/components/AccountHistoryCard";
import type { Account } from "@/lib/types";

// Accounts → Transaction history: the statement for one cash/bank account
// (?account=<id>, defaults to the first account).
export default function AccountHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/accounts");
    if (res.ok) setAccounts(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const requested = searchParams.get("account");
  const accountId = accounts.some((a) => a.id === requested) ? requested! : (accounts[0]?.id ?? "");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Transaction history</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Every payment, advance, expense, transfer and capital movement through an account, with a
            running balance.
          </p>
        </div>
        <Link href="/accounts" className="flex items-center gap-1 text-sm underline underline-offset-4">
          <ArrowLeft size={14} /> Accounts
        </Link>
      </div>
      {accounts.length === 0 ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : (
        <AccountHistoryCard
          accounts={accounts}
          accountId={accountId}
          onAccountChange={(id) => router.replace(`/accounts/history?account=${id}`)}
        />
      )}
    </div>
  );
}
