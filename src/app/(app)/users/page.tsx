"use client";

import { Fragment, useEffect, useState } from "react";
import Card from "@/components/Card";
import type { Role } from "@/lib/types";

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  STAFF: "Staff",
};

type AppUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
  hasPassword: boolean;
};

export default function UsersPage() {
  const [viewerRole, setViewerRole] = useState<Role | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [roleChangingId, setRoleChangingId] = useState<string | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("STAFF");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetDoneFor, setResetDoneFor] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendErrorFor, setResendErrorFor] = useState<string | null>(null);
  const [resendDoneFor, setResendDoneFor] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/users");
    setUsers(await res.json());
  }

  useEffect(() => {
    load();
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((d) => {
        setViewerRole(d.role ?? null);
        setViewerId(d.userId ?? null);
      });
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInvitedEmail(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setInvitedEmail(email);
      setName("");
      setEmail("");
      setRole("STAFF");
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendInvite(u: AppUser) {
    setResendError(null);
    setResendErrorFor(null);
    setResendDoneFor(null);
    setResendingId(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resendInvite: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResendError(data.error ?? "Could not resend invite");
        setResendErrorFor(u.id);
        return;
      }
      setResendDoneFor(u.id);
    } finally {
      setResendingId(null);
    }
  }

  async function handleRoleChange(u: AppUser, newRole: Role) {
    if (newRole === u.role) return;
    setRoleChangingId(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Could not change role");
        return;
      }
      load();
    } finally {
      setRoleChangingId(null);
    }
  }

  async function handleDelete(u: AppUser) {
    if (!confirm(`Permanently delete ${u.name} (${u.email})? This can't be undone.`)) return;
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Could not delete user");
      return;
    }
    load();
  }

  async function toggleActive(u: AppUser) {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !u.active }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Could not update user");
      return;
    }
    load();
  }

  function openReset(u: AppUser) {
    setResettingId(u.id);
    setNewPassword("");
    setResetError(null);
    setResetDoneFor(null);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resettingId) return;
    setResetError(null);
    setResetSubmitting(true);
    try {
      const res = await fetch(`/api/users/${resettingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetError(data.error ?? "Could not reset password");
        return;
      }
      setResetDoneFor(resettingId);
    } finally {
      setResetSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Users</h1>

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
        <div className="flex flex-col gap-1">
          <label className="text-xs text-black/60 dark:text-white/60">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
          >
            <option value="STAFF">Staff</option>
            <option value="ADMIN">Admin</option>
            {viewerRole === "SUPER_ADMIN" && <option value="SUPER_ADMIN">Super Admin</option>}
          </select>
        </div>
        <button
          disabled={submitting}
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Sending invite…" : "Send invite"}
        </button>
        {error && <p className="w-full text-sm text-red-600">{error}</p>}
        {invitedEmail && (
          <p className="w-full text-sm text-[#0ca30c]">
            Invite sent to {invitedEmail} — they can set their password using the link emailed to
            them.
          </p>
        )}
      </form>
      </Card>

      <Card className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-black/60 dark:text-white/60">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <Fragment key={u.id}>
              <tr className="border-t border-black/10 dark:border-white/10">
                <td className="px-3 py-2">{u.name}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">
                  {u.id === viewerId ? (
                    ROLE_LABELS[u.role]
                  ) : (
                    <select
                      value={u.role}
                      disabled={roleChangingId === u.id}
                      onChange={(e) => handleRoleChange(u, e.target.value as Role)}
                      className="rounded-md border border-black/15 px-1.5 py-1 text-sm disabled:opacity-50 dark:border-white/15 dark:bg-transparent"
                    >
                      <option value="STAFF">Staff</option>
                      <option value="ADMIN">Admin</option>
                      {viewerRole === "SUPER_ADMIN" && (
                        <option value="SUPER_ADMIN">Super Admin</option>
                      )}
                    </select>
                  )}
                </td>
                <td className="px-3 py-2">
                  {!u.active ? "Deactivated" : !u.hasPassword ? "Pending setup" : "Active"}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {!u.hasPassword && (
                    <button
                      onClick={() => handleResendInvite(u)}
                      disabled={resendingId === u.id}
                      className="mr-3 underline underline-offset-4 disabled:opacity-50"
                    >
                      {resendingId === u.id ? "Sending…" : "Resend invite"}
                    </button>
                  )}
                  <button
                    onClick={() => (resettingId === u.id ? setResettingId(null) : openReset(u))}
                    className="mr-3 underline underline-offset-4"
                  >
                    Set password directly
                  </button>
                  <button onClick={() => toggleActive(u)} className="underline underline-offset-4">
                    {u.active ? "Deactivate" : "Reactivate"}
                  </button>
                  {viewerRole === "SUPER_ADMIN" && u.id !== viewerId && (
                    <button
                      onClick={() => handleDelete(u)}
                      className="ml-3 text-red-600 underline underline-offset-4"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
              {resendErrorFor === u.id && resendError && (
                <tr>
                  <td colSpan={5} className="px-3 pb-2 text-sm text-red-600">
                    {resendError}
                  </td>
                </tr>
              )}
              {resendDoneFor === u.id && (
                <tr>
                  <td colSpan={5} className="px-3 pb-2 text-sm text-[#0ca30c]">
                    Invite resent to {u.email}.
                  </td>
                </tr>
              )}
              {resettingId === u.id && (
                <tr className="border-t border-black/5 dark:border-white/5">
                  <td colSpan={5} className="p-3">
                    <div className="rounded-lg bg-black/[0.02] p-3 dark:bg-white/[0.03]">
                      {resetDoneFor === u.id ? (
                        <p className="text-sm text-[#0ca30c]">
                          Password reset for {u.name}. Share the new password with them directly —
                          it won&apos;t be shown again.
                        </p>
                      ) : (
                        <form onSubmit={handleResetPassword} className="flex flex-wrap items-end gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-black/60 dark:text-white/60">
                              New password for {u.name}
                            </label>
                            <input
                              required
                              type="password"
                              minLength={8}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/15 dark:bg-transparent"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={resetSubmitting}
                            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                          >
                            {resetSubmitting ? "Setting…" : "Set password"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setResettingId(null)}
                            className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15"
                          >
                            Cancel
                          </button>
                          {resetError && <p className="w-full text-sm text-red-600">{resetError}</p>}
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      </Card>
    </div>
  );
}
