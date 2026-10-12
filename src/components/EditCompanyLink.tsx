import Link from "next/link";
import { isAdminRole, type Role } from "@/lib/types";

// Screen-only shortcut from a print page to where the business details
// (address, GSTIN…) are edited — admins only, never printed.
export default function EditCompanyLink({ role }: { role: Role }) {
  if (!isAdminRole(role)) return null;
  return (
    <Link href="/about#business-details" className="text-xs text-brand underline underline-offset-4 print:hidden">
      Edit address &amp; details
    </Link>
  );
}
