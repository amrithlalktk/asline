"use client";

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import Card from "@/components/Card";
import { formatCents } from "@/lib/money";
import { useAccounts } from "@/lib/useAccounts";
import {
  isAdminRole,
  parsePaymentMethod,
  accountName,
  type Category,
  type Item,
  type Party,
  type PaymentMethod,
  type Role,
} from "@/lib/types";

type EntityType = "SALE" | "PURCHASE" | "EXPENSE";

type SaleRow = {
  rowIndex: number;
  date: string;
  partyName: string;
  itemName: string;
  quantity: number;
  price: number;
  taxPercent: number;
  paid: number;
  paymentMethod: PaymentMethod;
  notes: string;
  error?: string;
};

type ExpenseRow = {
  rowIndex: number;
  date: string;
  description: string;
  categoryName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  notes: string;
  error?: string;
};

type RowResult = { rowIndex: number; ok: boolean; message: string };

const TEMPLATES: Record<EntityType, { headers: string[]; example: (string | number)[] }> = {
  SALE: {
    headers: ["Date", "Party", "Item", "Qty", "Price", "Tax %", "Paid", "Payment Method", "Notes"],
    example: ["2026-01-15", "Ravi Traders", "Copra", 10, 2500, 0, 25000, "Cash", ""],
  },
  PURCHASE: {
    headers: ["Date", "Party", "Item", "Qty", "Price", "Tax %", "Paid", "Payment Method", "Notes"],
    example: ["2026-01-15", "Farm Supplier", "Copra", 100, 2000, 0, 0, "Cash", ""],
  },
  EXPENSE: {
    headers: ["Date", "Description", "Category", "Amount", "Payment Method", "Notes"],
    example: ["2026-01-15", "Diesel for delivery van", "Fuel", 1500, "Cash", ""],
  },
};

function field(row: Record<string, unknown>, ...aliases: string[]): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const key = keys.find((k) => k.trim().toLowerCase() === alias.toLowerCase());
    if (key !== undefined) return String(row[key] ?? "").trim();
  }
  return "";
}

function parseDate(value: unknown): string | null {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    // Excel serial date (days since 1899-12-30).
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value.trim());
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return null;
}

function parseNumber(value: string): number | null {
  if (value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default function ImportPage() {
  const accounts = useAccounts();
  const [role, setRole] = useState<Role | null>(null);
  const [entityType, setEntityType] = useState<EntityType>("SALE");
  const [saleRows, setSaleRows] = useState<SaleRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<RowResult[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((d) => setRole(d.role ?? null));
    fetch("/api/parties")
      .then((res) => res.json())
      .then(setParties);
    fetch("/api/items")
      .then((res) => res.json())
      .then(setItems);
    fetch("/api/categories")
      .then((res) => res.json())
      .then(setCategories);
  }, []);

  function resetFile() {
    setSaleRows([]);
    setExpenseRows([]);
    setFileName("");
    setResults(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleTypeChange(type: EntityType) {
    setEntityType(type);
    resetFile();
  }

  function downloadTemplate() {
    const t = TEMPLATES[entityType];
    const sheet = XLSX.utils.aoa_to_sheet([t.headers, t.example]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Template");
    XLSX.writeFile(book, `${entityType.toLowerCase()}_import_template.xlsx`);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResults(null);
    setFileName(file.name);

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    if (entityType === "EXPENSE") {
      const rows: ExpenseRow[] = raw.map((r, i) => {
        const date = parseDate(r["Date"] ?? field(r, "date"));
        const description = field(r, "description", "desc");
        const categoryName = field(r, "category");
        const amountStr = field(r, "amount");
        const amount = parseNumber(amountStr);
        const methodRaw = field(r, "payment method", "method");
        const paymentMethod = parsePaymentMethod(methodRaw, accounts);
        const notes = field(r, "notes");

        let error: string | undefined;
        if (!date) error = "Missing or invalid Date";
        else if (!description) error = "Missing Description";
        else if (!categoryName) error = "Missing Category";
        else if (amount === null || amount <= 0) error = "Missing or invalid Amount";

        return {
          rowIndex: i + 2,
          date: date ?? "",
          description,
          categoryName,
          amount: amount ?? 0,
          paymentMethod,
          notes,
          error,
        };
      });
      setExpenseRows(rows);
    } else {
      const rows: SaleRow[] = raw.map((r, i) => {
        const date = parseDate(r["Date"] ?? field(r, "date"));
        const partyName = field(r, "party", "party name");
        const itemName = field(r, "item", "item name");
        const quantity = parseNumber(field(r, "qty", "quantity"));
        const price = parseNumber(field(r, "price"));
        const taxPercent = parseNumber(field(r, "tax %", "tax", "tax percent")) ?? 0;
        const paid = parseNumber(field(r, "paid")) ?? 0;
        const methodRaw = field(r, "payment method", "method");
        const paymentMethod = parsePaymentMethod(methodRaw, accounts);
        const notes = field(r, "notes");

        let error: string | undefined;
        if (!date) error = "Missing or invalid Date";
        else if (!itemName) error = "Missing Item";
        else if (quantity === null || quantity <= 0) error = "Missing or invalid Qty";
        else if (price === null || price < 0) error = "Missing or invalid Price";

        return {
          rowIndex: i + 2,
          date: date ?? "",
          partyName,
          itemName,
          quantity: quantity ?? 0,
          price: price ?? 0,
          taxPercent,
          paid,
          paymentMethod,
          notes,
          error,
        };
      });
      setSaleRows(rows);
    }
  }

  async function resolvePartyId(name: string): Promise<string | null> {
    if (!name.trim()) return null;
    const match = parties.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    if (match) return match.id;
    const res = await fetch("/api/parties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), type: "BOTH" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `Could not create party "${name}"`);
    setParties((prev) => [...prev, data]);
    return data.id as string;
  }

  async function resolveItemId(name: string): Promise<string> {
    const match = items.find((i) => i.name.toLowerCase() === name.trim().toLowerCase());
    if (match) return match.id;
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), unit: "pcs" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `Could not create item "${name}"`);
    setItems((prev) => [...prev, data]);
    return data.id as string;
  }

  async function resolveCategoryId(name: string): Promise<string> {
    const match = categories.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    if (match) return match.id;
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `Could not create category "${name}"`);
    setCategories((prev) => [...prev, data]);
    return data.id as string;
  }

  async function handleImport() {
    const rows = entityType === "EXPENSE" ? expenseRows : saleRows;
    const validRows = rows.filter((r) => !r.error);
    if (validRows.length === 0) return;

    setImporting(true);
    setProgress({ done: 0, total: validRows.length });
    const rowResults: RowResult[] = [];

    for (const row of validRows) {
      try {
        if (entityType === "EXPENSE") {
          const r = row as ExpenseRow;
          const categoryId = await resolveCategoryId(r.categoryName);
          const res = await fetch("/api/expenses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date: r.date,
              description: r.description,
              amount: r.amount,
              categoryId,
              paymentMethod: r.paymentMethod,
              notes: r.notes || null,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Could not create expense");
          rowResults.push({ rowIndex: row.rowIndex, ok: true, message: "Imported" });
        } else {
          const r = row as SaleRow;
          const [partyId, itemId] = await Promise.all([
            resolvePartyId(r.partyName),
            resolveItemId(r.itemName),
          ]);
          const apiBase = entityType === "SALE" ? "/api/sales" : "/api/purchases";
          const res = await fetch(apiBase, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date: r.date,
              partyId,
              items: [{ itemId, quantity: r.quantity, price: r.price, taxPercent: r.taxPercent }],
              charges: [],
              paid: r.paid,
              paymentMethod: r.paymentMethod,
              notes: r.notes || null,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Could not create record");
          rowResults.push({ rowIndex: row.rowIndex, ok: true, message: "Imported" });
        }
      } catch (e) {
        rowResults.push({
          rowIndex: row.rowIndex,
          ok: false,
          message: e instanceof Error ? e.message : "Could not import row",
        });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setResults(rowResults);
    setImporting(false);
  }

  if (role === null) return null;
  if (!isAdminRole(role)) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold">Import</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Only admins can bulk-import data.
        </p>
      </div>
    );
  }

  const rows = entityType === "EXPENSE" ? expenseRows : saleRows;
  const validCount = rows.filter((r) => !r.error).length;
  const errorCount = rows.length - validCount;
  const successCount = results?.filter((r) => r.ok).length ?? 0;
  const failCount = results?.filter((r) => !r.ok).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Import</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Upload an Excel file of sales, purchases, or expenses to bulk-create them. A party,
          item, or category name that doesn&apos;t exist yet is created automatically.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Type</label>
            <select
              value={entityType}
              onChange={(e) => handleTypeChange(e.target.value as EntityType)}
              className="bg-transparent py-1 text-sm focus:outline-none"
            >
              <option value="SALE">Sales</option>
              <option value="PURCHASE">Purchases</option>
              <option value="EXPENSE">Expenses</option>
            </select>
          </div>
          <button
            type="button"
            onClick={downloadTemplate}
            className="text-sm underline underline-offset-4"
          >
            Download template
          </button>
          <div className="ml-auto flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Excel file (.xlsx)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
              className="text-sm"
            />
          </div>
        </div>
      </Card>

      {fileName && rows.length > 0 && (
        <>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-black/60 dark:text-white/60">{fileName}</span>
            <span className="text-[#0ca30c]">{validCount} ready to import</span>
            {errorCount > 0 && <span className="text-[#d03b3b]">{errorCount} with errors</span>}
            <button onClick={resetFile} className="ml-auto text-sm underline underline-offset-4">
              Clear
            </button>
          </div>

          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-black/60 dark:text-white/60">
                  <tr>
                    <th className="px-4 py-3">Row</th>
                    {entityType === "EXPENSE" ? (
                      <>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3">Method</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Party</th>
                        <th className="px-4 py-3">Item</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3 text-right">Price</th>
                        <th className="px-4 py-3 text-right">Tax %</th>
                        <th className="px-4 py-3 text-right">Paid</th>
                      </>
                    )}
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {entityType === "EXPENSE"
                    ? expenseRows.map((r) => (
                        <tr key={r.rowIndex} className="border-t border-black/5 dark:border-white/5">
                          <td className="px-4 py-3 text-black/50 dark:text-white/50">{r.rowIndex}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{r.date || "—"}</td>
                          <td className="px-4 py-3">{r.description || "—"}</td>
                          <td className="px-4 py-3">{r.categoryName || "—"}</td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {formatCents(Math.round(r.amount * 100))}
                          </td>
                          <td className="px-4 py-3">{accountName(accounts, r.paymentMethod)}</td>
                          <td className="px-4 py-3">
                            {r.error ? (
                              <span className="text-[#d03b3b]">{r.error}</span>
                            ) : (
                              <span className="text-[#0ca30c]">Ready</span>
                            )}
                          </td>
                        </tr>
                      ))
                    : saleRows.map((r) => (
                        <tr key={r.rowIndex} className="border-t border-black/5 dark:border-white/5">
                          <td className="px-4 py-3 text-black/50 dark:text-white/50">{r.rowIndex}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{r.date || "—"}</td>
                          <td className="px-4 py-3">{r.partyName || "—"}</td>
                          <td className="px-4 py-3">{r.itemName || "—"}</td>
                          <td className="px-4 py-3 text-right">{r.quantity}</td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {formatCents(Math.round(r.price * 100))}
                          </td>
                          <td className="px-4 py-3 text-right">{r.taxPercent}%</td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {formatCents(Math.round(r.paid * 100))}
                          </td>
                          <td className="px-4 py-3">
                            {r.error ? (
                              <span className="text-[#d03b3b]">{r.error}</span>
                            ) : (
                              <span className="text-[#0ca30c]">Ready</span>
                            )}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex items-center gap-3">
            <button
              onClick={handleImport}
              disabled={importing || validCount === 0}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {importing
                ? `Importing ${progress.done}/${progress.total}…`
                : `Import ${validCount} row${validCount === 1 ? "" : "s"}`}
            </button>
            {results && (
              <span className="text-sm">
                <span className="text-[#0ca30c]">{successCount} imported</span>
                {failCount > 0 && (
                  <span className="ml-2 text-[#d03b3b]">{failCount} failed</span>
                )}
              </span>
            )}
          </div>

          {results && results.some((r) => !r.ok) && (
            <Card title="Errors">
              <ul className="flex flex-col gap-1 text-sm">
                {results
                  .filter((r) => !r.ok)
                  .map((r) => (
                    <li key={r.rowIndex} className="text-[#d03b3b]">
                      Row {r.rowIndex}: {r.message}
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
