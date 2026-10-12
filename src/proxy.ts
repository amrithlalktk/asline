import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";

const PUBLIC_PATHS = ["/login", "/reset-password"];
const ADMIN_ONLY_PREFIXES = ["/categories", "/users", "/accounts"];

// Next.js 16 "proxy" (formerly middleware) — runs on the Node.js runtime,
// which the session check needs (it uses Node's crypto via auth.ts).
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon.") ||
    pathname.startsWith("/apple-icon.") ||
    // PWA installability assets — a browser can probe these (e.g. deciding
    // whether to offer "Add to Home Screen") before the user has ever
    // logged in, so they can't require a session.
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/icons/") ||
    pathname === "/apple-touch-icon.png"
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (
    ADMIN_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix)) &&
    !isAdminRole(session.role)
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
