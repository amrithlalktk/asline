import { PrismaClient } from "@prisma/client";

// The schema also names DIRECT_URL (used for migrations). On Vercel + Neon
// it may only be provided as DATABASE_URL_UNPOOLED — fill it in so the
// client never fails on a missing variable it doesn't actually query with.
process.env.DIRECT_URL ??= process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
