"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import Card from "@/components/Card";
import { isAdminRole } from "@/lib/types";
import { useViewerRole } from "@/lib/useViewerRole";
import { companyLines, type CompanyInfo } from "@/lib/company";

const input = "rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent";

// The business's name, address, GSTIN, phone and email — printed at the
// top of every bill, statement and report export. Admins can edit them.
export default function BusinessDetailsCard({ initial }: { initial: CompanyInfo }) {
  const router = useRouter();
  const role = useViewerRole();
  const canEdit = role !== null && isAdminRole(role);
  const [company, setCompany] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      setCompany(data);
      setDraft(data);
      setEditing(false);
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof CompanyInfo, label: string, props: Record<string, unknown> = {}) => (
    <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
      {label}
      <input
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        className={input}
        {...props}
      />
    </label>
  );

  return (
    <div id="business-details" className="scroll-mt-20">
      <Card
        title="Business details (printed on bills & reports)"
        action={
          canEdit && !editing ? (
            <button
              onClick={() => {
                setDraft(company);
                setEditing(true);
                setSaved(false);
              }}
              className="flex items-center gap-1 text-sm text-brand underline underline-offset-4"
            >
              <Pencil size={14} /> Edit
            </button>
          ) : null
        }
      >
        {editing ? (
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            {field("name", "Business name", { required: true })}
            <label className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60">
              Address
              <textarea
                rows={3}
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                placeholder="Building, street, town, district, state – PIN"
                className={input}
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {field("phone", "Phone")}
              {field("email", "Email", { type: "email" })}
              {field("gstin", "GSTIN", { maxLength: 15 })}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button disabled={saving} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {saving ? "Saving…" : "Save details"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">{company.name}</p>
            {companyLines(company).map((line) => (
              <p key={line} className="text-sm whitespace-pre-line text-black/60 dark:text-white/60">
                {line}
              </p>
            ))}
            {companyLines(company).length === 0 && (
              <p className="text-sm text-black/45 dark:text-white/45">
                No address yet{canEdit ? " — click Edit to add it." : "."}
              </p>
            )}
            {saved && <p className="mt-1 text-sm text-[#0ca30c]">Saved — new bills and reports will use these details.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
