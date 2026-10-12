// `request.url` reflects the app's own internal listening address, not the
// public URL a user's browser actually hit — behind Docker's port mapping,
// a reverse proxy, or Vercel's edge, those differ, so a link built from it
// can point somewhere the user can't reach. Prefer an explicit `APP_URL`
// (set it once per deployment), then Vercel's own env var, then the
// forwarded headers a proxy sets, before falling back to `request.url`.
export function getAppOrigin(request: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}
