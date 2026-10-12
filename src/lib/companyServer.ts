import { db } from "@/lib/db";
import { DEFAULT_COMPANY, type CompanyInfo } from "@/lib/company";

// Server side: the saved company details (falls back to defaults if the
// row is somehow missing).
export async function getCompany(): Promise<CompanyInfo> {
  const row = await db.companyProfile.findUnique({ where: { id: "default" } });
  if (!row) return DEFAULT_COMPANY;
  return { name: row.name, address: row.address, gstin: row.gstin, phone: row.phone, email: row.email };
}
