import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/types";
import { getCompany } from "@/lib/companyServer";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getCompany());
}

const companySchema = z.object({
  name: z.string().trim().min(1, "Business name is required"),
  address: z.string().trim().default(""),
  gstin: z.string().trim().toUpperCase().default(""),
  phone: z.string().trim().default(""),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]).default(""),
});

// Admin only — these details print on every bill and report.
export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = companySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  await db.companyProfile.upsert({
    where: { id: "default" },
    create: { id: "default", ...parsed.data },
    update: parsed.data,
  });
  return NextResponse.json(await getCompany());
}
