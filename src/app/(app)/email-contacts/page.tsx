"use client";

import { useEffect, useState } from "react";
import type { EmailContact } from "@/lib/types";
import Card from "@/components/Card";

export default function EmailContactsPage() {
  const [contacts, setContacts] = useState<EmailContact[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const res = await fetch("/api/email-contacts");
    setContacts(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/email-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setName("");
      setEmail("");
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(c: EmailContact) {
    if (!confirm(`Remove "${c.name}" (${c.email}) from saved contacts?`)) return;
    const res = await fetch(`/api/email-contacts/${c.id}`, { method: "DELETE" });
    if (res.ok) load();
    else {
      const data = await res.json();
      alert(data.error ?? "Could not remove contact");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Email Contacts</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Saved addresses for people who aren&apos;t a Party but should still show up when
          searching recipients for &quot;Email PDF&quot; — e.g. an accountant, or your own second
          inbox. A Party&apos;s own email (set on the Party itself) shows up there too.
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
          <div className="flex flex-col gap-1">
            <label className="text-xs text-black/60 dark:text-white/60">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
            />
          </div>
          <button
            disabled={submitting}
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Add contact
          </button>
          {error && <p className="w-full text-sm text-red-600">{error}</p>}
        </form>
      </Card>

      <Card className="p-0">
        <ul>
          {contacts.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between border-b border-black/5 px-4 py-3 text-sm last:border-b-0 dark:border-white/5"
            >
              <span>
                {c.name} <span className="text-black/50 dark:text-white/50">({c.email})</span>
              </span>
              <button
                onClick={() => handleDelete(c)}
                className="text-[#d03b3b] underline underline-offset-4"
              >
                Delete
              </button>
            </li>
          ))}
          {contacts.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-black/50 dark:text-white/50">
              No saved contacts yet.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}
