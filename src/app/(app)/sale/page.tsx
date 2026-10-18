"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { formatBillNumber, formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { isAdminRole, type ChargeType, type Item, type Party, type Sale } from "@/lib/types";
import { useViewerRole } from "@/lib/useViewerRole";
import Card from "@/components/Card";
import SalePurchaseForm from "@/components/SalePurchaseForm";
import QuickEntryRow from "@/components/QuickEntryRow";
import PaymentHistory from "@/components/PaymentHistory";
import PaymentStatusIcon from "@/components/PaymentStatusIcon";
import SearchInput from "@/components/SearchInput";
import EmailPdfButton from "@/components/EmailPdfButton";
import AddFfaModal from "@/components/AddFfaModal";
import SaleProfitModal from "@/components/SaleProfitModal";
import ForwardSalesPanel, { type ForwardSale } from "@/components/ForwardSalesPanel";
import { linkedProfit } from "@/lib/saleProfit";
import { billFfaAmountCents, saleLineFfaSplit } from "@/lib/ffa";

export default function SalePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const viewerRole = useViewerRole();
  const canDelete = viewerRole !== null && isAdminRole(viewerRole);
  const formRef = useRef<HTMLDivElement>(null);

  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [chargeTypes, setChargeTypes] = useState<ChargeType[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "billNumber">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [editing, setEditing] = useState<Sale | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ffaSale, setFfaSale] = useState<Sale | null>(null);
  const [profitSaleId, setProfitSaleId] = useState<string | null>(null);
  // Sub-tabs: the sales register, and forward sales (agreed now, delivered
  // over later sale bills).
  const [tab, setTab] = useState<"SALES" | "FORWARD">(
    searchParams.get("tab") === "forward" ? "FORWARD" : "SALES"
  );
  const [openForwards, setOpenForwards] = useState<ForwardSale[]>([]);

  const loadForwards = useCallback(async () => {
    const res = await fetch("/api/forward-sales?status=OPEN");
    if (res.ok) setOpenForwards(await res.json());
  }, []);

  useEffect(() => {
    loadForwards();
  }, [loadForwards]);

  // Follow the URL, so the sidebar's "Forward sales" link switches tabs
  // even when the Sale page is already open.
  useEffect(() => {
    setTab(searchParams.get("tab") === "forward" ? "FORWARD" : "SALES");
  }, [searchParams]);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  const loadSales = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), sortBy, sortDir });
    if (search.trim()) params.set("q", search.trim());
    const res = await fetch(`/api/sales?${params.toString()}`);
    const data = await res.json();
    setSales(data.sales);
    setTotalPages(data.totalPages);
  }, [page, search, sortBy, sortDir]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setEditing(undefined);
      formRef.current?.scrollIntoView({ behavior: "smooth" });
      router.replace("/sale");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function openEdit(sale: Sale) {
    setEditing(sale);
    setAdvancedOpen(true);
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function handleSaved() {
    const wasEditing = Boolean(editing);
    setEditing(undefined);
    setAdvancedOpen(false);
    if (!wasEditing) setPage(1);
    loadSales();
    loadForwards();
  }

  function handleQuickSaved() {
    setPage(1);
    loadSales();
    loadForwards();
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

  async function handleDelete(sale: Sale) {
    if (!confirm("Delete this sale? This can't be undone.")) return;
    const res = await fetch(`/api/sales/${sale.id}`, { method: "DELETE" });
    if (res.ok) {
      loadSales();
      loadForwards();
    } else {
      const data = await res.json();
      alert(data.error ?? "Could not delete sale");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sales vs Forward sales is chosen from the sidebar's Sale dropdown
          (?tab=forward). */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">{tab === "FORWARD" ? "Forward sales" : "Sale"}</h1>
        {tab === "SALES" && (
          <SearchInput
            value={search}
            onChange={(v) => {
              setPage(1);
              setSearch(v);
            }}
            placeholder="Search party or item…"
          />
        )}
      </div>

      {tab === "FORWARD" ? (
        <ForwardSalesPanel parties={parties} items={items} canDelete={canDelete} onChanged={loadForwards} />
      ) : (
      <>
      <div ref={formRef}>
        {editing || advancedOpen ? (
          <Card title={editing ? "Editing sale" : "Advanced entry (multiple items, charges)"}>
            <SalePurchaseForm
              key={editing?.id ?? "new"}
              mode="SALE"
              parties={parties}
              items={items}
              chargeTypes={chargeTypes}
              initial={editing}
              forwardSales={openForwards}
              onSaved={handleSaved}
              onCancelEdit={() => {
                setEditing(undefined);
                setAdvancedOpen(false);
              }}
            />
          </Card>
        ) : (
          <button
            type="button"
            onClick={() => setAdvancedOpen(true)}
            className="self-start text-sm underline underline-offset-4"
          >
            Need multiple items or extra charges on one sale? Use advanced entry
          </button>
        )}
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead className="text-left text-black/60 dark:text-white/60">
              <tr>
                <th className="w-20 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort("billNumber")}
                    className="flex items-center gap-0.5 hover:text-black/90 dark:hover:text-white/90"
                  >
                    Bill # {sortBy === "billNumber" && (sortDir === "desc" ? "↓" : "↑")}
                  </button>
                </th>
                <th className="w-32 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort("date")}
                    className="flex items-center gap-0.5 hover:text-black/90 dark:hover:text-white/90"
                  >
                    Date {sortBy === "date" && (sortDir === "desc" ? "↓" : "↑")}
                  </button>
                </th>
                <th className="w-36 px-4 py-3">Party</th>
                <th className="w-36 px-4 py-3">Item</th>
                <th className="w-20 px-4 py-3 text-center">Qty</th>
                <th className="w-24 px-4 py-3">Price</th>
                <th className="w-24 px-4 py-3 text-center">FFA</th>
                <th className="w-20 px-4 py-3 text-center">Tax %</th>
                <th className="w-24 px-4 py-3 text-right">Total</th>
                <th className="w-40 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              <QuickEntryRow
                mode="SALE"
                parties={parties}
                items={items}
                onPartyCreated={(p) => setParties((prev) => [...prev, p])}
                onItemCreated={(i) => setItems((prev) => [...prev, i])}
                forwardSales={openForwards}
                onSaved={handleQuickSaved}
              />
              <tr>
                <td
                  colSpan={10}
                  className="bg-black/[0.03] px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-black/40 dark:bg-white/[0.04] dark:text-white/40"
                >
                  Recorded sales
                </td>
              </tr>
              {sales.map((sale) => {
                const ffaCents = billFfaAmountCents(sale.items);
                const linked = sale.linkedPurchases ?? [];
                const profit = linked.length > 0 ? linkedProfit(sale, linked) : null;
                return (
                  <Fragment key={sale.id}>
                  <tr className="border-t border-black/5 dark:border-white/5">
                    <td className="px-4 py-3 text-black/50 whitespace-nowrap dark:text-white/50">
                      #{formatBillNumber(sale.billNumber)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <PaymentStatusIcon
                          date={sale.date}
                          totalCents={sale.totalCents}
                          paidCents={sale.paidCents}
                        />
                        {formatDate(sale.date)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{sale.party?.name ?? "Cash sale"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {sale.items.map((l) => (
                          <span key={l.id}>
                            {l.item.name}
                            {l.forwardSale && (
                              <span className="ml-1.5 rounded-full bg-[#f5a524]/20 px-1.5 text-xs text-[#9a6200]">
                                Fwd #{formatBillNumber(l.forwardSale.number)}
                              </span>
                            )}
                          </span>
                        ))}
                        {sale.charges.map((c) => (
                          <span key={c.id} className="text-black/50 dark:text-white/50">
                            + {c.label} ({formatCents(c.amountCents)})
                          </span>
                        ))}
                        {sale.payments
                          .filter((p) => p.source === "ADVANCE")
                          .map((p) => (
                            <span key={p.id} className="text-[#0ca30c]">
                              {formatCents(p.amountCents)} settled from advance credit
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col gap-0.5">
                        {sale.items.map((l) => (
                          <span key={l.id}>{l.quantity}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {sale.items.map((l) => {
                          const split = saleLineFfaSplit(l);
                          return (
                            <span key={l.id} className="whitespace-nowrap">
                              {formatCents(l.priceCents)}
                              {split.bonusCents > 0 && (
                                <span className="block text-xs text-black/45 dark:text-white/45">
                                  Sold {formatCents(split.baseRateCents)}
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col gap-0.5">
                        {/* The grade often arrives days after the bill — a
                            graded line opens the dialog to change it; an
                            ungraded one offers to add it (highlighted for
                            items marked as needing FFA). */}
                        {sale.items.map((l) =>
                          l.ffaGrade ? (
                            <button
                              key={l.id}
                              onClick={() => setFfaSale(sale)}
                              title="Change FFA grade"
                              className="underline decoration-dotted underline-offset-4 hover:text-brand"
                            >
                              {l.ffaGrade}
                            </button>
                          ) : l.item.ffaGraded ? (
                            <button
                              key={l.id}
                              onClick={() => setFfaSale(sale)}
                              className="mx-auto rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-[#9a6200] hover:bg-accent/35"
                            >
                              + Add FFA
                            </button>
                          ) : (
                            <button
                              key={l.id}
                              onClick={() => setFfaSale(sale)}
                              title="Add an FFA grade to this line"
                              className="text-xs text-black/35 hover:text-brand hover:underline dark:text-white/35"
                            >
                              + FFA
                            </button>
                          )
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col gap-0.5">
                        {sale.items.map((l) => (
                          <span key={l.id}>{l.taxPercent > 0 ? `${l.taxPercent}%` : "—"}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatCents(sale.totalCents)}
                      {/* What the bill was sold at before FFA was added. */}
                      {ffaCents !== 0 && (
                        <span
                          className="block text-xs text-black/45 dark:text-white/45"
                          title={`FFA added ${formatCents(ffaCents)}`}
                        >
                          Sold {formatCents(sale.totalCents - ffaCents)}
                        </span>
                      )}
                      {/* Profit from the purchases linked to this sale —
                          or the way in to link them. */}
                      <button
                        onClick={() => setProfitSaleId(sale.id)}
                        className={`block w-full text-right text-xs font-medium underline-offset-2 hover:underline ${
                          !profit ? "text-brand" : profit.profitCents >= 0 ? "text-[#0a7d0a]" : "text-[#d03b3b]"
                        }`}
                      >
                        {!profit
                          ? "P&L"
                          : `${profit.profitCents >= 0 ? "Profit" : "Loss"} ${formatCents(Math.abs(profit.profitCents))}`}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <a
                        href={`/print/sale/${sale.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mr-2 underline underline-offset-4"
                      >
                        Print
                      </a>
                      <button
                        onClick={() => setExpandedId(expandedId === sale.id ? null : sale.id)}
                        className="mr-2 underline underline-offset-4"
                      >
                        Payments
                      </button>
                      <EmailPdfButton
                        endpoint={`/api/print/sale/${sale.id}/email`}
                        defaultRecipient={
                          sale.party?.email ? { name: sale.party.name, email: sale.party.email } : null
                        }
                        label="Email"
                        className="mr-2 underline underline-offset-4 disabled:opacity-40"
                      />
                      <button onClick={() => openEdit(sale)} className="mr-2 underline underline-offset-4">
                        Edit
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(sale)}
                          className="text-[#d03b3b] underline underline-offset-4"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedId === sale.id && (
                    <tr className="border-t border-black/5 dark:border-white/5">
                      <td colSpan={10} className="p-3">
                        <PaymentHistory
                          apiBase={`/api/sales/${sale.id}`}
                          payments={sale.payments}
                          totalCents={sale.totalCents}
                          paidCents={sale.paidCents}
                          onChange={loadSales}
                          canDelete={canDelete}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-black/50 dark:text-white/50">
                    {search ? "No sales match your search." : "No sales recorded yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {profitSaleId && (
        <SaleProfitModal
          saleId={profitSaleId}
          onClose={() => setProfitSaleId(null)}
          onSaved={() => {
            setProfitSaleId(null);
            loadSales();
          }}
        />
      )}

      {ffaSale && (
        <AddFfaModal
          sale={ffaSale}
          onClose={() => setFfaSale(null)}
          onSaved={() => {
            setFfaSale(null);
            loadSales();
          }}
        />
      )}

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
      </>
      )}
    </div>
  );
}
