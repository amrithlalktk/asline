"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import { isAdminRole, type Party } from "@/lib/types";
import { useViewerRole } from "@/lib/useViewerRole";
import Modal from "@/components/Modal";
import Card from "@/components/Card";
import PartyForm from "@/components/PartyForm";
import PartyAdvancePayments from "@/components/PartyAdvancePayments";
import SearchInput from "@/components/SearchInput";

export default function PartiesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const viewerRole = useViewerRole();
  const canDelete = viewerRole !== null && isAdminRole(viewerRole);

  const [parties, setParties] = useState<Party[]>([]);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Party | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/parties");
    setParties(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openAdd();
      router.replace("/parties");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function openAdd() {
    setEditing(undefined);
    setModalOpen(true);
  }
  function openEdit(p: Party) {
    setEditing(p);
    setModalOpen(true);
  }
  function handleSaved() {
    setModalOpen(false);
    load();
  }

  async function handleDelete(p: Party) {
    if (!confirm(`Delete "${p.name}"?`)) return;
    const res = await fetch(`/api/parties/${p.id}`, { method: "DELETE" });
    if (res.ok) load();
    else {
      const data = await res.json();
      alert(data.error ?? "Could not delete party");
    }
  }

  const filteredParties = parties.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.phone ?? "").toLowerCase().includes(q) ||
      (p.email ?? "").toLowerCase().includes(q) ||
      (p.gstNumber ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Parties</h1>
        <div className="flex flex-1 items-center justify-end gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search parties…" />
          <button
            onClick={openAdd}
            className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white"
          >
            + Add party
          </button>
        </div>
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-black/60 dark:text-white/60">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredParties.map((p) => (
                <Fragment key={p.id}>
                <tr className="border-t border-black/5 dark:border-white/5">
                  <td className="px-4 py-3">
                    <Link href={`/parties/${p.id}`} className="underline underline-offset-4">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize">{p.type.toLowerCase()}</td>
                  <td className="px-4 py-3">{p.phone ?? "—"}</td>
                  <td
                    className={`px-4 py-3 text-right whitespace-nowrap ${
                      p.balanceCents > 0
                        ? "text-[#0ca30c]"
                        : p.balanceCents < 0
                          ? "text-[#d03b3b]"
                          : ""
                    }`}
                  >
                    {p.balanceCents === 0
                      ? formatCents(0)
                      : `${p.balanceCents > 0 ? "Receive " : "Pay "}${formatCents(Math.abs(p.balanceCents))}`}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                      className="mr-2 underline underline-offset-4"
                    >
                      Advance
                    </button>
                    <button onClick={() => openEdit(p)} className="mr-2 underline underline-offset-4">
                      Edit
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(p)}
                        className="text-[#d03b3b] underline underline-offset-4"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
                {expandedId === p.id && (
                  <tr className="border-t border-black/5 dark:border-white/5">
                    <td colSpan={5} className="p-3">
                      <PartyAdvancePayments
                        partyId={p.id}
                        availableAdvanceCents={p.availableAdvanceCents}
                        availableAdvanceForPurchaseCents={p.availableAdvanceForPurchaseCents}
                        onChange={load}
                        canDelete={canDelete}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
              {filteredParties.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-black/50 dark:text-white/50">
                    {parties.length === 0 ? "No parties yet." : "No parties match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {modalOpen && (
        <Modal title={editing ? "Edit party" : "Add party"} onClose={() => setModalOpen(false)}>
          <PartyForm initial={editing} onSaved={handleSaved} onCancel={() => setModalOpen(false)} />
        </Modal>
      )}
    </div>
  );
}
