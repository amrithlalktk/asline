"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import Card from "@/components/Card";
import EmailPdfButton from "@/components/EmailPdfButton";
import { formatCents } from "@/lib/money";
import { displayUnit } from "@/lib/units";
import { downloadReportCsv, downloadReportPdf } from "@/lib/reportExport";
import { formatDate } from "@/lib/date";

type Row = { name: string; cents: number };
type Sheet = {
  asOf: string;
  assets: {
    cashBank: (Row & { type: string })[];
    receivables: Row[];
    stock: (Row & { unit: string; qty: number; rateCents: number })[];
    total: number;
  };
  liabilities: { payables: Row[]; overdrafts: (Row & { type: string })[]; total: number };
  totals: { cashBank: number; receivables: number; stock: number; payables: number; overdrafts: number };
  equityCents: number;
  equity: { partnerCapital: Row[]; capitalCents: number; retainedCents: number };
};

const HEADER = ["Section", "Line", "Amount"];
const qty = (n: number) => Number(n.toFixed(2)).toLocaleString();

function Section({
  title,
  totalCents,
  rows,
  empty,
  detail,
}: {
  title: string;
  totalCents: number;
  rows: Row[];
  empty: string;
  detail?: (r: Row, i: number) => string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-black/5 py-2 first:border-t-0 dark:border-white/5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={rows.length === 0}
        className="flex w-full items-center gap-1.5 text-left text-sm"
      >
        {rows.length > 0 ? (open ? <ChevronDown size={15} /> : <ChevronRight size={15} />) : <span className="w-[15px]" />}
        <span className="flex-1">{title}</span>
        <span className="font-medium">{formatCents(totalCents)}</span>
      </button>
      {open && (
        <ul className="mt-1 ml-6 flex flex-col gap-0.5 text-xs text-black/60 dark:text-white/60">
          {rows.map((r, i) => (
            <li key={`${r.name}-${i}`} className="flex justify-between gap-3">
              <span className="truncate">
                {r.name}
                {detail?.(r, i) && <span className="text-black/40 dark:text-white/40"> · {detail(r, i)}</span>}
              </span>
              <span>{formatCents(r.cents)}</span>
            </li>
          ))}
        </ul>
      )}
      {rows.length === 0 && <p className="ml-6 text-xs text-black/40 dark:text-white/40">{empty}</p>}
    </div>
  );
}

// Balance sheet as of today: what the business owns (cash & bank,
// receivables, stock) against what it owes (payables, overdrafts); the
// difference is the owner's equity.
export default function BalanceSheetPage() {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [generatedBy, setGeneratedBy] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/reports/balance-sheet");
    if (res.ok) setSheet(await res.json());
  }, []);

  useEffect(() => {
    load();
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((d) => setGeneratedBy(d.name ?? ""));
  }, [load]);

  const asOf = sheet ? formatDate(sheet.asOf) : "";
  const title = `Balance Sheet (as of ${formatDate(asOf)})`;

  function rows(): string[][] {
    if (!sheet) return [];
    const r = (cents: number) => (cents / 100).toFixed(2);
    const lines = (section: string, items: Row[]) => items.map((i) => [section, i.name, r(i.cents)]);
    return [
      ...lines("Assets · Cash & bank", sheet.assets.cashBank),
      ...lines("Assets · Receivables", sheet.assets.receivables),
      ...lines("Assets · Stock", sheet.assets.stock),
      ["Assets", "TOTAL ASSETS", r(sheet.assets.total)],
      ...lines("Liabilities · Payables", sheet.liabilities.payables),
      ...lines("Liabilities · Bank overdraft", sheet.liabilities.overdrafts),
      ["Liabilities", "TOTAL LIABILITIES", r(sheet.liabilities.total)],
      ...lines("Equity · Partners' capital", sheet.equity.partnerCapital),
      ["Equity", "Profit kept in business", r(sheet.equity.retainedCents)],
      ["Equity", "TOTAL EQUITY (assets − liabilities)", r(sheet.equityCents)],
    ];
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Balance Sheet</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          As of {asOf || "today"} — what the business owns and owes right now.
        </p>
      </div>

      <Card className="print:hidden">
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={load} className="mr-auto rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15">
            Refresh
          </button>
          <button
            disabled={!sheet}
            onClick={() => downloadReportCsv({ filename: "balance_sheet.csv", title, header: HEADER, rows: rows(), generatedBy })}
            className="rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-40 dark:border-white/15"
          >
            Export CSV
          </button>
          <button
            disabled={!sheet}
            onClick={() => downloadReportPdf({ filename: "balance_sheet.pdf", title, header: HEADER, rows: rows(), generatedBy })}
            className="rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-40 dark:border-white/15"
          >
            Export PDF
          </button>
          <EmailPdfButton
            endpoint="/api/reports/email-pdf"
            body={{ filename: "balance_sheet.pdf", title, header: HEADER, rows: rows() }}
            disabled={!sheet}
          />
          <button onClick={() => window.print()} className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15">
            Print
          </button>
        </div>
      </Card>

      {!sheet ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Assets — what the business owns">
              <Section
                title="Cash & bank"
                totalCents={sheet.totals.cashBank}
                rows={sheet.assets.cashBank}
                empty="No money in any account."
              />
              <Section
                title="Receivables — parties owe you"
                totalCents={sheet.totals.receivables}
                rows={sheet.assets.receivables}
                empty="Nobody owes you money."
              />
              <Section
                title="Stock (at average purchase cost)"
                totalCents={sheet.totals.stock}
                rows={sheet.assets.stock}
                empty="No stock with a purchase cost."
                detail={(_, i) => {
                  const s = sheet.assets.stock[i];
                  return `${qty(s.qty)} ${displayUnit(s.unit)} × ${formatCents(s.rateCents)}`;
                }}
              />
              <div className="mt-2 flex justify-between border-t border-black/15 pt-2 font-semibold dark:border-white/15">
                <span>Total assets</span>
                <span>{formatCents(sheet.assets.total)}</span>
              </div>
            </Card>

            <Card title="Liabilities & equity — what the business owes">
              <Section
                title="Payables — you owe parties"
                totalCents={sheet.totals.payables}
                rows={sheet.liabilities.payables}
                empty="You don't owe anyone."
              />
              <Section
                title="Bank overdraft"
                totalCents={sheet.totals.overdrafts}
                rows={sheet.liabilities.overdrafts}
                empty="No account is below zero."
              />
              <div className="mt-2 flex justify-between border-t border-black/15 pt-2 font-semibold dark:border-white/15">
                <span>Total liabilities</span>
                <span>{formatCents(sheet.liabilities.total)}</span>
              </div>
              <div className="mt-3 rounded-lg bg-brand/10 px-3 py-1">
                <Section
                  title="Partners' capital"
                  totalCents={sheet.equity.capitalCents}
                  rows={sheet.equity.partnerCapital}
                  empty="No partner capital recorded (Partners & Capital page)."
                />
                <div className="flex justify-between border-t border-black/5 py-2 text-sm dark:border-white/5">
                  <span className="pl-[21px]">Profit kept in business</span>
                  <span className={`font-medium ${sheet.equity.retainedCents < 0 ? "text-[#d03b3b]" : ""}`}>
                    {formatCents(sheet.equity.retainedCents)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-black/10 py-2 font-medium dark:border-white/10">
                  <span>Owner&apos;s equity</span>
                  <span className={`font-semibold ${sheet.equityCents < 0 ? "text-[#d03b3b]" : "text-brand"}`}>
                    {formatCents(sheet.equityCents)}
                  </span>
                </div>
              </div>
              <div className="mt-2 flex justify-between border-t border-black/15 pt-2 font-semibold dark:border-white/15">
                <span>Liabilities + equity</span>
                <span>{formatCents(sheet.liabilities.total + sheet.equityCents)}</span>
              </div>
            </Card>
          </div>

          <p className="text-xs text-black/50 dark:text-white/50">
            Owner&apos;s equity = total assets − total liabilities: partners&apos; capital (added −
            withdrawn) plus profit kept in the business (opening balances and profit to date). Party balances include advances (a customer&apos;s unused advance is a payable;
            an advance you paid a supplier is a receivable). Stock is valued at each item&apos;s
            average purchase cost.
          </p>
        </>
      )}
    </div>
  );
}
