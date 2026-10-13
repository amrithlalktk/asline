import { NextResponse } from "next/server";

// Called by Vercel Cron (see "crons" in vercel.json) at 01:00 and 18:00 IST
// to start the GitHub Actions "Database backup" workflow. GitHub's own
// schedule is best-effort and can skip runs, so this is the reliable
// trigger; the workflow's schedule stays as a fallback.
//
// Needs (Vercel → Settings → Environment Variables):
//   CRON_SECRET          — any long random string; Vercel sends it as
//                          "Authorization: Bearer <CRON_SECRET>" on cron calls
//   GITHUB_BACKUP_TOKEN  — GitHub fine-grained token for this repo with
//                          "Actions: Read and write" permission
//   GITHUB_REPO          — optional, defaults to amrithlalktk/asline
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = process.env.GITHUB_BACKUP_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "GITHUB_BACKUP_TOKEN is not set" }, { status: 500 });
  }
  const repo = process.env.GITHUB_REPO || "amrithlalktk/asline";

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/db-backup.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );
  if (!res.ok) {
    const detail = await res.text();
    console.error("Backup dispatch failed", res.status, detail);
    return NextResponse.json({ error: `GitHub responded ${res.status}`, detail }, { status: 502 });
  }
  return NextResponse.json({ ok: true, startedAt: new Date().toISOString() });
}
