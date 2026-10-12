import { cookies } from "next/headers";
import { randomBytes, createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";

const PASSWORD_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export const SESSION_COOKIE = "session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is not set");
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  userId: string;
  role: Role;
  name: string;
  email: string;
};

export function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

// Used for both "forgot password" and the new-user invite-setup link — same
// shape, same lifetime, same one-time-use semantics either way.
export async function createPasswordSetupToken(userId: string) {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  await db.passwordResetToken.create({
    data: { userId, tokenHash, expiresAt: new Date(Date.now() + PASSWORD_TOKEN_TTL_MS) },
  });
  return rawToken;
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function signSessionToken(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(payload: SessionPayload) {
  const token = await signSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Deliberately NOT tied to NODE_ENV — a production build served over
    // plain HTTP (e.g. this app's own Docker setup on localhost) needs a
    // non-Secure cookie, or browsers won't store/send it and login breaks
    // silently. Only set COOKIE_SECURE=true once the app is actually served
    // over HTTPS (e.g. behind a reverse proxy, or on Vercel).
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
