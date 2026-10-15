"use client";

import { ChevronDown, ChevronRight, ListPlus, Users } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { formatBillNumber, formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { isAdminRole, type ChargeType, type Item, type Party, type Purchase } from "@/lib/types";
import { useViewerRole } from "@/lib/useViewerRole";
import Card from "@/components/Card";
import SalePurchaseForm from "@/components/SalePurchaseForm";
import CombinedPurchaseForm from "@/components/CombinedPurchaseForm";
import CombinedBillModal from "@/components/CombinedBillModal";
import QuickEntryRow from "@/components/QuickEntryRow";
import PaymentHistory from "@/components/PaymentHistory";
import PaymentStatusIcon from "@/components/PaymentStatusIcon";
import SearchInput from "@/components/SearchInput";

type CombinedBill = {
  kind: "COMBINED";
  groupId: string;
  billNumber: number;
  date: string;
  parts: Purchase[];
};
type ListBill = { kind: "SINGLE"; purchase: Purchase } | CombinedBill;

export default function PurchasePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const viewerRole = useViewerRole();
  const canDelete = viewerRole !== null && isAdminRole(viewerRole);
  const formRef = useRef<HTMLDivElement>(null);

  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [chargeTypes, setChargeTypes] = useState<ChargeType[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "billNumber">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [editing, setEditing] = useState<Purchase | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [combinedOpen, setCombinedOpen] = useState(false);
  const [viewGroupId, setViewGroupId] = useState<string | null>(null);
  const [addToGroup, setAddToGroup] = useState(false);
  const [openBills, setOpenBills] = useState<Set<string>>(new Set());
  function toggleBill(groupId: string) {
    setOpenBills((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  // A combined bill's supplier entries share one bill number and come back
  // together — fold them into one bill for the list.
  const bills: ListBill[] = [];
  for (const purchase of purchases) {
    const last = bills[bills.length - 1];
    if (purchase.group && last?.kind === "COMBINED" && last.groupId === purchase.group.id) {
      last.parts.push(purchase);
    } else if (purchase.group) {
      bills.push({
        kind: "COMBINED",
        groupId: purchase.group.id,
        billNumber: purchase.billNumber,
        date: purchase.date,
        parts: [purchase],
      });
    } else {
      bills.push({ kind: "SINGLE", purchase });
    }
  }

  const loadLookups = useCallback(async () => {
    const [partiesRes, itemsRes, chargeTypesRes] = await Promise.all([
      fetch("/api/parties"),
      fetch("/api/items"),
      fetch("/api/charge-types"),
    ]);
    setParties(await partiesRes.json());
    setItems(await itemsRes.json());
    setChargeTypes(await chargeTypesRes.json());
  }, []);

  const loadPurchases = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), sortBy, sortDir });
    if (search.trim()) params.set("q", search.trim());
    const res = await fetch(`/api/purchases?${params.toString()}`);
    const data = await res.json();
    setPurchases(data.purchases);
    setTotalPages(data.totalPages);
  }, [page, search, sortBy, sortDir]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    loadPurchases();
  }, [loadPurchases]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setEditing(undefined);
      formRef.current?.scrollIntoView({ behavior: "smooth" });
      router.replace("/purchase");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function openEdit(purchase: Purchase) {
    setEditing(purchase);
    setAdvancedOpen(true);
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function handleSaved() {
    const wasEditing = Boolean(editing);
    setEditing(undefined);
    setAdvancedOpen(false);
    if (!wasEditing) setPage(1);
    loadPurchases();
  }

  function handleQuickSaved() {
    setPage(1);
    loadPurchases();
  }

  function toggleSort(field: "date" | "billNumber") {
    setPage(1);
    if (sortBy === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
  }

  async function handleDelete(purchase: Purchase) {
    if (!confirm("Delete this purchase? This can't be undone.")) return;
    const res = await fetch(`/api/purchases/${purchase.id}`, { method: "DELETE" });
    if (res.ok) loadPurchases();
    else {
      const data = await res.json();
      alert(data.error ?? "Could not delete purchase");
    }
  }

  // One purchase entry's row (+ its payment history when expanded).
  // `nested` = a supplier entry shown inside a combined bill.
  function renderPurchaseRow(purchase: Purchase, nested = false) {
    return (
                  <Fragment key={purchase.id}>
                  <tr
                    className={`border-t border-black/5 dark:border-white/5 ${nested ? "bg-[#f5a524]/[0.05]" : ""}`}
                  >
                    <td className="px-2 py-3 text-black/50 whitespace-nowrap dark:text-white/50">
                      {nested ? <span className="pl-2 text-black/30">↳</span> : `#${formatBillNumber(purchase.billNumber)}`}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <PaymentStatusIcon
                          date={purchase.date}
                          totalCents={purchase.totalCents}
                          paidCents={purchase.paidCents}
                        />
                        {formatDate(purchase.date)}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      {purchase.party?.name ?? "—"}
                      {purchase.linkedSale && (
                        <span className="block text-xs text-brand">
                          Sold on Sale #{formatBillNumber(purchase.linkedSale.billNumber)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-col gap-0.5">
                        {purchase.items.map((l) => (
                          <span key={l.id}>{l.item.name}</span>
                        ))}
                        {purchase.charges.map((c) => (
                          <span key={c.id} className="text-black/50 dark:text-white/50">
                            + {c.label} ({formatCents(c.amountCents)})
                          </span>
                        ))}
                        {purchase.payments
                          .filter((p) => p.source === "ADVANCE")
                          .map((p) => (
                            <span key={p.id} className="text-[#0ca30c]">
                              {formatCents(p.amountCents)} settled from advance credit
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <div className="flex flex-col gap-0.5">
                        {purchase.items.map((l) => (
                          <span key={l.id}>{l.quantity} kg</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-col gap-0.5">
                        {purchase.items.map((l) => (
                          <span key={l.id}>{formatCents(l.priceCents)}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <div className="flex flex-col gap-0.5">
                        {purchase.items.map((l) => (
                          <span key={l.id}>{l.ffaGrade || "—"}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <div className="flex flex-col gap-0.5">
                        {purchase.items.map((l) => (
                          <span key={l.id}>{l.taxPercent > 0 ? `${l.taxPercent}%` : "—"}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right whitespace-nowrap">
                      {formatCents(purchase.totalCents)}
                    </td>
                    <td className="px-2 py-3 text-right whitespace-nowrap">
                      <a
                        href={`/print/purchase/${purchase.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mr-2 underline underline-offset-4"
                      >
                        Print
                      </a>
                      <button
                        onClick={() => setExpandedId(expandedId === purchase.id ? null : purchase.id)}
                        className="mr-2 underline underline-offset-4"
                      >
                        Payments
                      </button>
                      <button onClick={() => openEdit(purchase)} className="mr-2 underline underline-offset-4">
                        Edit
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(purchase)}
                          className="text-[#d03b3b] underline underline-offset-4"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedId === purchase.id && (
                    <tr className="border-t border-black/5 dark:border-white/5">
                      <td colSpan={10} className="p-3">
                        <PaymentHistory
                          apiBase={`/api/purchases/${purchase.id}`}
                          payments={purchase.payments}
                          totalCents={purchase.totalCents}
                          paidCents={purchase.paidCents}
                          onChange={loadPurchases}
                          canDelete={canDelete}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
    );
  }

  // A combined bill (several suppliers, one bill number) as one row: its
  // suppliers, items and grand total; click to list every supplier entry.
  function renderCombinedRow(bill: CombinedBill) {
    const total = bill.parts.reduce((sum, p) => sum + p.totalCents, 0);
    const paid = bill.parts.reduce((sum, p) => sum + p.paidCents, 0);
    const open = openBills.has(bill.groupId);
    const itemNames = [...new Set(bill.parts.flatMap((p) => p.items.map((l) => l.item.name)))];
    // Weights are shown in kg throughout this list (see the entry rows).
    const totalQty = bill.parts.reduce((sum, p) => sum + p.items.reduce((s, l) => s + l.quantity, 0), 0);
    const sales = [...new Set(bill.parts.flatMap((p) => (p.linkedSale ? [p.linkedSale.billNumber] : [])))];
    return (
      <tr
        key={`${bill.groupId}-row`}
        onClick={() => toggleBill(bill.groupId)}
        className="cursor-pointer border-t border-black/5 hover:bg-black/[0.02] dark:border-white/5"
      >
        <td className="px-2 py-3 whitespace-nowrap text-black/50 dark:text-white/50">
          <span className="flex items-center gap-1">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}#{formatBillNumber(bill.billNumber)}
          </span>
        </td>
        <td className="px-2 py-3 whitespace-nowrap">
          <span className="inline-flex items-center gap-2">
            <PaymentStatusIcon date={bill.date} totalCents={total} paidCents={paid} />
            {formatDate(bill.date)}
          </span>
        </td>
        <td className="px-2 py-3">
          <span className="mb-0.5 inline-block rounded-full bg-[#f5a524]/20 px-2 text-xs font-medium text-[#9a6200]">
            {bill.parts.length} supplier{bill.parts.length === 1 ? "" : "s"}
          </span>
          {bill.parts.map((p) => (
            <span key={p.id} className="block truncate">
              {p.party?.name ?? "—"}
            </span>
          ))}
          {sales.length > 0 && (
            <span className="block text-xs text-brand">
              Sold on Sale {sales.map((n) => `#${formatBillNumber(n)}`).join(", ")}
            </span>
          )}
        </td>
        <td className="px-2 py-3">
          {itemNames.map((n) => (
            <span key={n} className="block">
              {n}
            </span>
          ))}
        </td>
        <td className="px-2 py-3 text-center">
          <span className="whitespace-nowrap">{Number(totalQty.toFixed(2))} kg</span>
        </td>
        <td className="px-2 py-3 text-black/40" colSpan={3}>
          {open ? "Entries below" : "Click to see each supplier's entry"}
        </td>
        <td className="px-2 py-3 text-right whitespace-nowrap font-medium">{formatCents(total)}</td>
        <td className="px-2 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <a
            href={`/print/purchase-group/${bill.groupId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mr-2 underline underline-offset-4"
          >
            Print
          </a>
          <button
            onClick={() => {
              setAddToGroup(false);
              setViewGroupId(bill.groupId);
            }}
            className="mr-2 underline underline-offset-4"
          >
            Summary
          </button>
          <button
            onClick={() => {
              setAddToGroup(true);
              setViewGroupId(bill.groupId);
            }}
            className="mr-2 font-medium text-brand underline underline-offset-4"
          >
            + Supplier
          </button>
          <button onClick={() => toggleBill(bill.groupId)} className="underline underline-offset-4">
            {open ? "Hide entries" : "Entries"}
          </button>
        </td>
      </tr>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Purchase</h1>
        <SearchInput
          value={search}
          onChange={(v) => {
            setPage(1);
            setSearch(v);
          }}
          placeholder="Search party or item…"
        />
      </div>

      <div ref={formRef}>
        {editing || advancedOpen ? (
          <Card title={editing ? "Editing purchase" : "Advanced entry (multiple items, charges)"}>
            <SalePurchaseForm
              key={editing?.id ?? "new"}
              mode="PURCHASE"
              parties={parties}
              items={items}
              chargeTypes={chargeTypes}
              initial={editing}
              onSaved={handleSaved}
              onCancelEdit={() => {
                setEditing(undefined);
                setAdvancedOpen(false);
              }}
            />
          </Card>
        ) : combinedOpen ? (
          <Card title="Combined bill — several suppliers on one bill">
            <CombinedPurchaseForm
              parties={parties}
              items={items}
              onSaved={() => {
                setCombinedOpen(false);
                loadPurchases();
              }}
              onCancel={() => setCombinedOpen(false)}
            />
          </Card>
        ) : (
          <div className="flex flex-wrap gap-2 py-1">
            <button
              type="button"
              onClick={() => setAdvancedOpen(true)}
              title="Multiple items or extra charges on one purchase"
              className="flex items-center gap-2 rounded-lg border border-black/15 bg-white/60 px-3 py-2 text-sm font-medium hover:border-brand hover:text-brand dark:border-white/15 dark:bg-transparent"
            >
              <ListPlus size={16} />
              Advanced entry
              <span className="hidden font-normal text-black/50 sm:inline dark:text-white/50">
                · multiple items / charges
              </span>
            </button>
            <button
              type="button"
              onClick={() => setCombinedOpen(true)}
              title="Goods from several suppliers on one bill"
              className="flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Users size={16} />
              Combined bill
              <span className="hidden font-normal text-white/75 sm:inline">· several suppliers</span>
            </button>
          </div>
        )}
      </div>

      <Card className="p-0">
          <table className="w-full table-fixed text-sm">
            <thead className="text-left text-black/60 dark:text-white/60">
              <tr>
                <th className="w-20 px-2 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort("billNumber")}
                    className="flex items-center gap-0.5 hover:text-black/90 dark:hover:text-white/90"
                  >
                    Bill # {sortBy === "billNumber" && (sortDir === "desc" ? "↓" : "↑")}
                  </button>
                </th>
                <th className="w-32 px-2 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort("date")}
                    className="flex items-center gap-0.5 hover:text-black/90 dark:hover:text-white/90"
                  >
                    Date {sortBy === "date" && (sortDir === "desc" ? "↓" : "↑")}
                  </button>
                </th>
                <th className="w-36 px-2 py-3">Party</th>
                <th className="w-36 px-2 py-3">Item</th>
                <th className="w-20 px-2 py-3 text-center">Weight</th>
                <th className="w-32 px-2 py-3">Price</th>
                <th className="w-16 px-2 py-3 text-center">FFA</th>
                <th className="w-16 px-2 py-3 text-center">Tax %</th>
                <th className="w-32 px-2 py-3 text-right">Total</th>
                <th className="w-56 px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              <QuickEntryRow
                mode="PURCHASE"
                parties={parties}
                items={items}
                onPartyCreated={(p) => setParties((prev) => [...prev, p])}
                onItemCreated={(i) => setItems((prev) => [...prev, i])}
                onSaved={handleQuickSaved}
              />
              <tr>
                <td
                  colSpan={10}
                  className="bg-black/[0.03] px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-black/40 dark:bg-white/[0.04] dark:text-white/40"
                >
                  Recorded purchases
                </td>
              </tr>
              {bills.map((bill) =>
                bill.kind === "SINGLE" ? (
                  renderPurchaseRow(bill.purchase)
                ) : (
                  <Fragment key={bill.groupId}>
                    {renderCombinedRow(bill)}
                    {openBills.has(bill.groupId) && bill.parts.map((part) => renderPurchaseRow(part, true))}
                  </Fragment>
                )
              )}
              {purchases.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-black/50 dark:text-white/50">
                    {search ? "No purchases match your search." : "No purchases recorded yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
      {viewGroupId && (
        <CombinedBillModal
          groupId={viewGroupId}
          canDelete={canDelete}
          parties={parties}
          items={items}
          startAdding={addToGroup}
          onChanged={loadPurchases}
          onClose={() => setViewGroupId(null)}
          onDeleted={() => {
            setViewGroupId(null);
            loadPurchases();
          }}
        />
      )}
    </div>
  );
}
