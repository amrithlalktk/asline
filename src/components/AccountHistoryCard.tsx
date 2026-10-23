"use client";

import { forwardRef, useCallback, useEffect, useState } from "react";
import Card from "@/components/Card";
import EmailPdfButton from "@/components/EmailPdfButton";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { downloadReportCsv, downloadReportPdf } from "@/lib/reportExport";
import type { Account } from "@/lib/types";
import DateInput from "@/components/DateInput";

type Row = {
  key: string;
  date: string;
  kind: string;
  details: string;
  inCents: number;
  outCents: number;
  balanceCents: number;
};
type History = {
  account: { id: string; name: string };
  broughtForwardCents: number;
  closingCents: number;
  totalInCents: number;
  totalOutCents: number;
  rows: Row[];
};

const input = "rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-transparent";
const iso = (d: Date) => d.toISOString().slice(0, 10);
function monthsAgo(n: number) {
  const d = new Date();
  return iso(new Date(Date.UTC(d.getFullYear(), d.getMonth() - n, 1)));
}
const HEADER = ["Date", "Type", "Details", "In", "Out", "Balance"];

const IN_KINDS = ["Sale payment", "Advance received", "Income", "Capital added"];

// Statement for one account: every payment, advance, expense, transfer and
// capital movement through it in the chosen period, with a running balance
// that starts from the balance brought forward.
const AccountHistoryCard = forwardRef<HTMLDivElement, {
  accounts: Account[];
  accountId: string;
  onAccountChange: (id: string) => void;
}>(function AccountHistoryCard({ accounts, accountId, onAccountChange }, ref) {
  const [from, setFrom] = useState(monthsAgo(2));
  const [to, setTo] = useState(iso(new Date()));
  const [data, setData] = useState<History | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/accounts/${accountId}/history?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [accountId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const title = data ? `${data.account.name} — account history (${from ? formatDate(from) : "start"} to ${to ? formatDate(to) : "today"})` : "";
  function rows(): string[][] {
    if (!data) return [];
    const r = (c: number) => (c / 100).toFixed(2);
    return [
      ["", "", "Balance brought forward", "", "", r(data.broughtForwardCents)],
      ...data.rows.map((x) => [formatDate(x.date), x.kind, x.details, x.inCents ? r(x.inCents) : "", x.outCents ? r(x.outCents) : "", r(x.balanceCents)]),
      ["", "", "Totals / closing balance", r(data.totalInCents), r(data.totalOutCents), r(data.closingCents)],
    ];
  }
  const fileBase = data ? `${data.account.name.replace(/\W+/g, "_").toLowerCase()}_history_${from || "start"}_to_${to || "today"}` : "history";

  return (
    <div ref={ref} className="scroll-mt-20">
      <Card title="Account history">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
            Account
            <select value={accountId} onChange={(e) => onAccountChange(e.target.value)} className={input}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
            From
            <DateInput value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
            To
            <DateInput value={to} onChange={(e) => setTo(e.target.value)} className={input} />
          </label>
          <div className="flex gap-1 text-xs">
            {(
              [
                ["This month", monthsAgo(0)],
                ["3 months", monthsAgo(2)],
                ["All", ""],
              ] as const
            ).map(([label, f]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setFrom(f);
                  setTo(iso(new Date()));
                }}
                className={`rounded-full px-2.5 py-1 ${from === f ? "bg-brand text-white" : "bg-black/5 hover:bg-black/10 dark:bg-white/10"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={!data}
              onClick={() => downloadReportCsv({ filename: `${fileBase}.csv`, title, header: HEADER, rows: rows(), generatedBy: "" })}
              className="rounded-md border border-black/15 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-white/15"
            >
              Export CSV
            </button>
            <button
              type="button"
              disabled={!data}
              onClick={() => downloadReportPdf({ filename: `${fileBase}.pdf`, title, header: HEADER, rows: rows(), generatedBy: "" })}
              className="rounded-md border border-black/15 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-white/15"
            >
              Export PDF
            </button>
            <EmailPdfButton
              endpoint="/api/reports/email-pdf"
              body={data ? { filename: `${fileBase}.pdf`, title, header: HEADER, rows: rows() } : null}
              disabled={!data}
              className="rounded-md border border-black/15 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-white/15"
            />
          </div>
        </div>

        {!data ? (
          <p className="text-sm text-black/50">{loading ? "Loading…" : "Choose an account."}</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div className="rounded-lg bg-black/[0.03] p-2 dark:bg-white/[0.04]">
                <p className="text-xs text-black/50 dark:text-white/50">Brought forward</p>
                <p className="font-semibold">{formatCents(data.broughtForwardCents)}</p>
              </div>
              <div className="rounded-lg bg-[#0ca30c]/10 p-2">
                <p className="text-xs text-black/50 dark:text-white/50">Money in</p>
                <p className="font-semibold text-[#0a7d0a]">+{formatCents(data.totalInCents)}</p>
              </div>
              <div className="rounded-lg bg-[#d03b3b]/10 p-2">
                <p className="text-xs text-black/50 dark:text-white/50">Money out</p>
                <p className="font-semibold text-[#d03b3b]">−{formatCents(data.totalOutCents)}</p>
              </div>
              <div className="rounded-lg bg-brand/10 p-2">
                <p className="text-xs text-black/50 dark:text-white/50">Closing balance</p>
                <p className={`font-semibold ${data.closingCents < 0 ? "text-[#d03b3b]" : "text-brand"}`}>{formatCents(data.closingCents)}</p>
              </div>
            </div>

            <div className="max-h-[32rem] overflow-auto rounded-lg border border-black/10 dark:border-white/10">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 bg-white/90 text-left text-xs text-black/50 backdrop-blur dark:bg-[#1e2231]/90 dark:text-white/50">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Details</th>
                    <th className="px-3 py-2 text-right font-medium">In</th>
                    <th className="px-3 py-2 text-right font-medium">Out</th>
                    <th className="px-3 py-2 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-black/5 bg-black/[0.02] dark:border-white/5 dark:bg-white/[0.03]">
                    <td className="px-3 py-2 text-black/50" colSpan={5}>
                      Balance brought forward
                    </td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{formatCents(data.broughtForwardCents)}</td>
                  </tr>
                  {data.rows.map((r) => (
                    <tr key={r.key} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.date)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            IN_KINDS.includes(r.kind) || r.inCents > 0
                              ? "bg-[#0ca30c]/12 text-[#0a7d0a]"
                              : "bg-[#d03b3b]/10 text-[#d03b3b]"
                          }`}
                        >
                          {r.kind}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-black/70 dark:text-white/70">{r.details}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-[#0a7d0a]">{r.inCents ? formatCents(r.inCents) : ""}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-[#d03b3b]">{r.outCents ? formatCents(r.outCents) : ""}</td>
                      <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${r.balanceCents < 0 ? "text-[#d03b3b]" : ""}`}>
                        {formatCents(r.balanceCents)}
                      </td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-black/50 dark:text-white/50">
                        No transactions in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
});

export default AccountHistoryCard;
