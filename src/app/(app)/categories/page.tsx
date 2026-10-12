"use client";

import { useEffect, useState } from "react";
import type { Category, ChargeType } from "@/lib/types";
import Card from "@/components/Card";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [chargeTypes, setChargeTypes] = useState<ChargeType[]>([]);
  const [chargeName, setChargeName] = useState("");
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [chargeSubmitting, setChargeSubmitting] = useState(false);

  async function load() {
    const res = await fetch("/api/categories");
    setCategories(await res.json());
  }
  async function loadChargeTypes() {
    const res = await fetch("/api/charge-types");
    setChargeTypes(await res.json());
  }

  useEffect(() => {
    load();
    loadChargeTypes();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setName("");
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(c: Category) {
    if (!confirm(`Delete category "${c.name}"?`)) return;
    const res = await fetch(`/api/categories/${c.id}`, { method: "DELETE" });
    if (res.ok) load();
    else {
      const data = await res.json();
      alert(data.error ?? "Could not delete category");
    }
  }

  async function handleAddChargeType(e: React.FormEvent) {
    e.preventDefault();
    setChargeError(null);
    setChargeSubmitting(true);
    try {
      const res = await fetch("/api/charge-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: chargeName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChargeError(data.error ?? "Something went wrong");
        return;
      }
      setChargeName("");
      loadChargeTypes();
    } finally {
      setChargeSubmitting(false);
    }
  }

  async function handleDeleteChargeType(c: ChargeType) {
    if (!confirm(`Delete charge type "${c.name}"?`)) return;
    const res = await fetch(`/api/charge-types/${c.id}`, { method: "DELETE" });
    if (res.ok) loadChargeTypes();
    else {
      const data = await res.json();
      alert(data.error ?? "Could not delete charge type");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Expense categories</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Income is tracked automatically through Sale — categories here are for
          classifying expenses only.
        </p>
      </div>

      <Card>
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </div>
          <button
            disabled={submitting}
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Add category
          </button>
          {error && <p className="w-full text-sm text-red-600">{error}</p>}
        </form>
      </Card>

      <Card className="p-0">
        <ul>
          {categories.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between border-b border-black/5 px-4 py-3 text-sm last:border-b-0 dark:border-white/5"
            >
              <span>{c.name}</span>
              <button
                onClick={() => handleDelete(c)}
                className="text-[#d03b3b] underline underline-offset-4"
              >
                Delete
              </button>
            </li>
          ))}
          {categories.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-black/50 dark:text-white/50">
              No categories yet.
            </li>
          )}
        </ul>
      </Card>

      <div>
        <h1 className="text-lg font-semibold">Sale &amp; Purchase charge types</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Common additional charges (freight, packing charge, handling…) offered
          when recording a sale or purchase. &quot;Other&quot; is always available for
          a one-off charge that isn&apos;t in this list.
        </p>
      </div>

      <Card>
        <form onSubmit={handleAddChargeType} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Name</label>
            <input
              required
              value={chargeName}
              onChange={(e) => setChargeName(e.target.value)}
              className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </div>
          <button
            disabled={chargeSubmitting}
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Add charge type
          </button>
          {chargeError && <p className="w-full text-sm text-red-600">{chargeError}</p>}
        </form>
      </Card>

      <Card className="p-0">
        <ul>
          {chargeTypes.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between border-b border-black/5 px-4 py-3 text-sm last:border-b-0 dark:border-white/5"
            >
              <span>{c.name}</span>
              <button
                onClick={() => handleDeleteChargeType(c)}
                className="text-[#d03b3b] underline underline-offset-4"
              >
                Delete
              </button>
            </li>
          ))}
          {chargeTypes.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-black/50 dark:text-white/50">
              No charge types yet.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}
