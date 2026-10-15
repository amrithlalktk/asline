"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { isAdminRole, type Category, type Expense } from "@/lib/types";
import { useViewerRole } from "@/lib/useViewerRole";
import Modal from "@/components/Modal";
import Card from "@/components/Card";
import ExpenseForm from "@/components/ExpenseForm";
import SearchInput from "@/components/SearchInput";
import { expenseBillsLabel } from "@/lib/reportHelpers";
import DateInput from "@/components/DateInput";

export default function ExpensesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const viewerRole = useViewerRole();
  const canDelete = viewerRole !== null && isAdminRole(viewerRole);

  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | undefined>(undefined);

  const loadCategories = useCallback(async () => {
    const res = await fetch("/api/categories");
    setCategories(await res.json());
  }, []);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (categoryId) params.set("categoryId", categoryId);
    if (search.trim()) params.set("q", search.trim());
    const res = await fetch(`/api/expenses?${params.toString()}`);
    const data = await res.json();
    setExpenses(data.expenses);
    setTotalPages(data.totalPages);
    setLoading(false);
  }, [page, from, to, categoryId, search]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openAdd();
      router.replace("/expenses");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function openAdd() {
    setEditing(undefined);
    setModalOpen(true);
  }
  function openEdit(e: Expense) {
    setEditing(e);
    setModalOpen(true);
  }
  function handleSaved() {
    setModalOpen(false);
    loadExpenses();
  }

  async function handleDelete(e: Expense) {
    if (!confirm(`Delete "${e.description}"? This can't be undone.`)) return;
    const res = await fetch(`/api/expenses/${e.id}`, { method: "DELETE" });
    if (res.ok) loadExpenses();
    else {
      const data = await res.json();
      alert(data.error ?? "Could not delete expense");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Expenses</h1>
        <div className="flex flex-1 items-center justify-end gap-3">
          <SearchInput
            value={search}
            onChange={(v) => {
              setPage(1);
              setSearch(v);
            }}
            placeholder="Search description…"
          />
          <button
            onClick={openAdd}
            className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white"
          >
            + Add expense
          </button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">From</label>
            <DateInput
              value={from}
              onChange={(e) => {
                setPage(1);
                setFrom(e.target.value);
              }}
              className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">To</label>
            <DateInput
              value={to}
              onChange={(e) => {
                setPage(1);
                setTo(e.target.value);
              }}
              className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Category</label>
            <select
              value={categoryId}
              onChange={(e) => {
                setPage(1);
                setCategoryId(e.target.value);
              }}
              className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {(from || to || categoryId || search) && (
            <button
              onClick={() => {
                setFrom("");
                setTo("");
                setCategoryId("");
                setSearch("");
                setPage(1);
              }}
              className="text-sm underline underline-offset-4"
            >
              Clear filters
            </button>
          )}
        </div>
      </Card>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-black/60 dark:text-white/60">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Recorded by</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-t border-black/5 dark:border-white/5">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(e.date)}</td>
                  <td className="px-4 py-3">
                    {e.description}
                    {expenseBillsLabel(e) && (
                      <span className="block text-xs text-brand">For {expenseBillsLabel(e)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{e.category.name}</td>
                  <td className="px-4 py-3">{e.recordedBy.name}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-[#d03b3b]">
                    -{formatCents(e.amountCents)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(e)} className="mr-2 underline underline-offset-4">
                      Edit
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(e)}
                        className="text-[#d03b3b] underline underline-offset-4"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && expenses.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-black/50 dark:text-white/50">
                    No expenses match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-black/15 px-2 py-1 disabled:opacity-40 dark:border-white/15"
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-black/15 px-2 py-1 disabled:opacity-40 dark:border-white/15"
          >
            Next
          </button>
        </div>
      )}

      {modalOpen && (
        <Modal title={editing ? "Edit expense" : "Add expense"} onClose={() => setModalOpen(false)}>
          <ExpenseForm
            categories={categories}
            initial={editing}
            onSaved={handleSaved}
            onCancel={() => setModalOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
}
