// Transaction dates are stored as UTC midnight of the calendar day the user
// picked (a date-only value with no meaningful time-of-day). Always format
// them in UTC so the displayed date doesn't shift by a day depending on the
// viewer's timezone.
// Always DD-MM-YYYY — never left to the browser's language, which shows
// MM-DD-YYYY for English (US) in Chrome.
export function formatDate(date: string | Date) {
  return formatBillDate(date);
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

// A moment in time (e.g. "Printed on …") as DD-MM-YYYY, hh:mm AM/PM in the
// viewer's local time — fixed format, not the browser's language.
export function formatDateTime(date: Date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const h = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${day}-${month}-${date.getFullYear()}, ${h12}:${minutes} ${h < 12 ? "AM" : "PM"}`;
}
