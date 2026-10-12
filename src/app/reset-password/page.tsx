"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import Logo from "@/components/Logo";
import Watermark from "@/components/Watermark";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <>
        <p className="mb-4 text-sm text-black/60 dark:text-white/60">
          This reset link is missing its token — open the link from your email again, or
          request a new one from the login page.
        </p>
        <button
          onClick={() => router.push("/login")}
          className="self-start text-sm underline underline-offset-4"
        >
          Back to sign in
        </button>
      </>
    );
  }

  if (done) {
    return (
      <>
        <p className="mb-4 text-sm text-black/70 dark:text-white/70">
          Your password has been reset. Sign in with your new password.
        </p>
        <button
          onClick={() => router.push("/login")}
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white"
        >
          Go to sign in
        </button>
      </>
    );
  }

  return (
    <>
      <p className="mb-6 text-sm text-black/60 dark:text-white/60">
        Choose a new password for your account.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="relative">
          <input
            required
            type={showPassword ? "text" : "password"}
            minLength={8}
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-black/15 px-3 py-2 pr-10 text-sm dark:border-white/15 dark:bg-transparent"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-black/40 hover:text-black dark:text-white/40 dark:hover:text-white"
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <input
          required
          type={showPassword ? "text" : "password"}
          minLength={8}
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Please wait…" : "Reset password"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="isolate relative min-h-screen overflow-hidden">
      <Watermark />
      <div className="relative mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
        <div className="mb-4">
          <Logo iconSize={40} />
        </div>
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
