// The business's own details (name, address, GSTIN…) shown on bills,
// statements and report exports. Stored in the database (CompanyProfile)
// and edited on the About page — see getCompany in companyServer.ts.
export type CompanyInfo = {
  name: string;
  address: string;
  gstin: string;
  phone: string;
  email: string;
};

export const DEFAULT_COMPANY: CompanyInfo = { name: "AS LINE", address: "", gstin: "", phone: "", email: "" };

// The detail lines under the company name, skipping any left blank.
export function companyLines(c: CompanyInfo) {
  return [
    c.address,
    [c.phone && `Phone: ${c.phone}`, c.email && `Email: ${c.email}`].filter(Boolean).join(" · "),
    c.gstin && `GSTIN: ${c.gstin}`,
  ].filter(Boolean) as string[];
}

// Browser side: the saved details, for report exports built in the page.
export async function fetchCompany(): Promise<CompanyInfo> {
  try {
    const res = await fetch("/api/company");
    if (res.ok) return await res.json();
  } catch {
    // fall through to defaults
  }
  return DEFAULT_COMPANY;
}
