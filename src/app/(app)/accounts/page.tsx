"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Banknote, Landmark } from "lucide-react";
import Card from "@/components/Card";
import AccountTransferCard from "@/components/AccountTransferCard";
import AccountHistoryCard from "@/components/AccountHistoryCard";
import { formatCents } from "@/lib/money";
import { invalidateAccounts } from "@/lib/useAccounts";
import { CASH_ACCOUNT_ID, type Account, type AccountType } from "@/lib/types";

const inputClass =
  "rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent";

type Draft = { name: string; type: AccountType; openingBalance: string };
const emptyDraft: Draft = { name: "", type: "BANK", openingBalance: "" };

// Cash in hand and each bank account, with an opening balance. Every
// payment, advance and expense picks one of these, so the balance shown
// here moves on its own as money comes in or goes out.
export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [editError, setEditError] = useState<string | null>(null);
  // Account whose history is shown (defaults to the first account).
  const [historyId, setHistoryId] = useState("");
  const historyRef = useRef<HTMLDivElement>(null);
  function showHistory(id: string) {
    setHistoryId(id);
    historyRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function load() {
    const res = await fetch("/api/accounts");
    setAccounts(await res.json());
    invalidateAccounts();
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          type: draft.type,
          openingBalance: Number(draft.openingBalance) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setDraft(emptyDraft);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(a: Account) {
    setEditingId(a.id);
    setEditError(null);
    setEditDraft({
      name: a.name,
      type: a.type,
      openingBalance: (a.openingBalanceCents / 100).toString(),
    });
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return res.ok ? null : (data.error ?? "Could not update account");
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const err = await patch(editingId, {
      name: editDraft.name,
      type: editDraft.type,
      openingBalance: Number(editDraft.openingBalance) || 0,
    });
    if (err) {
      setEditError(err);
      return;
    }
    setEditingId(null);
    load();
  }

  async function toggleActive(a: Account) {
    const err = await patch(a.id, { active: !a.active });
    if (err) alert(err);
    else load();
  }

  async function handleDelete(a: Account) {
    if (!confirm(`Delete account "${a.name}"?`)) return;
    const res = await fetch(`/api/accounts/${a.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "Could not delete account");
      return;
    }
    load();
  }

  const totalCents = accounts.reduce((sum, a) => sum + (a.balanceCents ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Accounts</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Set the opening balance of your cash and each bank account. Balances update automatically
          from every payment received or made, advance, and expense recorded against the account.
        </p>
      </div>

      <Card title="Add account">
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Name</label>
            <input
              required
              placeholder="e.g. HDFC Current A/c"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Type</label>
            <select
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as AccountType })}
              className={inputClass}
            >
              <option value="BANK">Bank</option>
              <option value="CASH">Cash</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Opening balance</label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={draft.openingBalance}
              onChange={(e) => setDraft({ ...draft, openingBalance: e.target.value })}
              className={`${inputClass} w-36`}
            />
          </div>
          <button
            disabled={submitting}
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Adding…" : "Add account"}
          </button>
          {error && <p className="w-full text-sm text-red-600">{error}</p>}
        </form>
      </Card>

      {/* Accounts page is admin-only, so admins can undo transfers here. */}
      <AccountTransferCard accounts={accounts} canDelete onChanged={load} />

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-black/60 dark:text-white/60">
              <tr>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3 text-right">Opening</th>
                <th className="px-4 py-3 text-right">Money in</th>
                <th className="px-4 py-3 text-right">Money out</th>
                <th className="px-4 py-3 text-right">Available balance</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const Icon = a.type === "CASH" ? Banknote : Landmark;
                const balance = a.balanceCents ?? 0;
                return (
                  <Fragment key={a.id}>
                    <tr
                      className={`border-t border-black/5 dark:border-white/5 ${a.active ? "" : "opacity-50"}`}
                    >
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2">
                          <Icon size={16} className="text-brand" />
                          <span className="font-medium">{a.name}</span>
                          {!a.active && <span className="text-xs text-black/50">(hidden)</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {formatCents(a.openingBalanceCents)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap text-[#0ca30c]">
                        +{formatCents(a.inCents ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap text-[#d03b3b]">
                        −{formatCents(a.outCents ?? 0)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${balance < 0 ? "text-[#d03b3b]" : ""}`}
                      >
                        {formatCents(balance)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => showHistory(a.id)} className="mr-3 font-medium text-brand underline underline-offset-4">
                          History
                        </button>
                        <button onClick={() => startEdit(a)} className="mr-3 underline underline-offset-4">
                          Edit
                        </button>
                        {a.id !== CASH_ACCOUNT_ID && (
                          <>
                            <button
                              onClick={() => toggleActive(a)}
                              className="mr-3 underline underline-offset-4"
                            >
                              {a.active ? "Hide" : "Show"}
                            </button>
                            <button
                              onClick={() => handleDelete(a)}
                              className="text-[#d03b3b] underline underline-offset-4"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                    {editingId === a.id && (
                      <tr className="border-t border-black/5 dark:border-white/5">
                        <td colSpan={6} className="p-3">
                          <form
                            onSubmit={handleSaveEdit}
                            className="flex flex-wrap items-end gap-2 rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03]"
                          >
                            <div className="flex flex-col gap-1">
                              <label className="text-xs text-black/60 dark:text-white/60">Name</label>
                              <input
                                required
                                value={editDraft.name}
                                onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                                className={inputClass}
                              />
                            </div>
                            {a.id !== CASH_ACCOUNT_ID && (
                              <div className="flex flex-col gap-1">
                                <label className="text-xs text-black/60 dark:text-white/60">Type</label>
                                <select
                                  value={editDraft.type}
                                  onChange={(e) =>
                                    setEditDraft({ ...editDraft, type: e.target.value as AccountType })
                                  }
                                  className={inputClass}
                                >
                                  <option value="BANK">Bank</option>
                                  <option value="CASH">Cash</option>
                                </select>
                              </div>
                            )}
                            <div className="flex flex-col gap-1">
                              <label className="text-xs text-black/60 dark:text-white/60">
                                Opening balance
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={editDraft.openingBalance}
                                onChange={(e) =>
                                  setEditDraft({ ...editDraft, openingBalance: e.target.value })
                                }
                                className={`${inputClass} w-36`}
                              />
                            </div>
                            <button className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white">
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15"
                            >
                              Cancel
                            </button>
                            {editError && <p className="w-full text-sm text-red-600">{editError}</p>}
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-black/10 dark:border-white/10">
                <td className="px-4 py-3 font-medium" colSpan={4}>
                  Total available
                </td>
                <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                  {formatCents(totalCents)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      {accounts.length > 0 && (
        <AccountHistoryCard
          ref={historyRef}
          accounts={accounts}
          accountId={historyId || accounts[0].id}
          onAccountChange={setHistoryId}
        />
      )}
    </div>
  );
}
