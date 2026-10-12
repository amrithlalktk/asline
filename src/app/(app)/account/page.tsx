"use client";

import { useEffect, useState } from "react";
import Card from "@/components/Card";

export default function AccountPage() {
  const [notifyEmails, setNotifyEmails] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((d) => {
        setNotifyEmails(d.notifyEmails ?? "");
        setLoaded(true);
      });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyEmails: notifyEmails.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      setNotifyEmails(data.notifyEmails ?? "");
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Account</h1>

      <Card title="Email PDFs to">
        {loaded && (
          <form onSubmit={handleSave} className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-black/60 dark:text-white/60">
                Where the &quot;Email PDF&quot; button sends bills and reports — separate
                multiple addresses with commas
              </label>
              <input
                type="email"
                multiple
                placeholder="you@example.com, accountant@example.com"
                value={notifyEmails}
                onChange={(e) => setNotifyEmails(e.target.value)}
                className="w-96 rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
              />
            </div>
            <button
              disabled={saving}
              className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {error && <p className="w-full text-sm text-red-600">{error}</p>}
            {saved && <p className="w-full text-sm text-[#0ca30c]">Saved.</p>}
          </form>
        )}
      </Card>
    </div>
  );
}
