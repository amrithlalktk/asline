// Transaction dates are stored as UTC midnight of the calendar day the user
// picked (a date-only value with no meaningful time-of-day). Always format
// them in UTC so the displayed date doesn't shift by a day depending on the
// viewer's timezone.
export function formatDate(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(undefined, { timeZone: "UTC" });
}

// Fixed DD-MM-YYYY for the printed bill — unlike formatDate, not left to the
// viewer's locale, so every printed invoice reads the same way regardless
// of who's printing it.
export function formatBillDate(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
}
