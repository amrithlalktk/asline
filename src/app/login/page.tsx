"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import Logo from "@/components/Logo";
import Watermark from "@/components/Watermark";
import ThemeToggle from "@/components/ThemeToggle";

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/bootstrap-check")
      .then((res) => res.json())
      .then((data) => setNeedsSetup(Boolean(data.needsSetup)))
      .finally(() => setChecking(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        needsSetup ? "/api/auth/signup" : "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            needsSetup ? { name, email, password } : { email, password }
          ),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setForgotSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      setForgotMessage(
        res.ok
          ? data.message
          : (data.error ?? "Something went wrong")
      );
    } finally {
      setForgotSubmitting(false);
    }
  }

  if (checking) return null;

  return (
    <div className="isolate relative min-h-screen overflow-hidden">
      <Watermark />
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="relative mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
        <div className="mb-4">
          <Logo iconSize={40} />
        </div>
      <p className="mb-6 text-sm text-black/60 dark:text-white/60">
        {showForgot
          ? "Enter your email and we'll send a link to reset your password."
          : needsSetup
            ? "Set up the first admin account to get started."
            : "Sign in to record and review transactions."}
      </p>
      {showForgot ? (
        <form onSubmit={handleForgotSubmit} className="flex flex-col gap-3">
          <input
            required
            type="email"
            placeholder="Email"
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
            className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
          />
          {forgotMessage && (
            <p className="text-sm text-black/70 dark:text-white/70">{forgotMessage}</p>
          )}
          <button
            type="submit"
            disabled={forgotSubmitting}
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {forgotSubmitting ? "Sending…" : "Send reset link"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowForgot(false);
              setForgotMessage(null);
            }}
            className="self-start text-sm underline underline-offset-4"
          >
            Back to sign in
          </button>
        </form>
      ) : (
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {needsSetup && (
          <input
            required
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
          />
        )}
        <input
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/15 dark:bg-transparent"
        />
        <div className="relative">
          <input
            required
            type={showPassword ? "text" : "password"}
            placeholder="Password"
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting
            ? "Please wait…"
            : needsSetup
              ? "Create admin account"
              : "Sign in"}
        </button>
        {!needsSetup && (
          <button
            type="button"
            onClick={() => {
              setShowForgot(true);
              setForgotEmail(email);
            }}
            className="self-start text-sm underline underline-offset-4"
          >
            Forgot password?
          </button>
        )}
        </form>
      )}
      </div>
    </div>
  );
}
