import { useEffect, useState } from "react";
import type { Role } from "@/lib/types";

// Client components can't read the session cookie directly, so anything
// that needs to hide an admin-only action (e.g. a delete button staff
// can't use) fetches its own role via this hook instead of duplicating the
// same /api/auth/me call everywhere.
export function useViewerRole() {
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((d) => setRole(d.role ?? null));
  }, []);
  return role;
}
