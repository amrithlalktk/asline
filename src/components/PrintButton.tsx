"use client";

// Print-only chrome (this button, and anything else marked print:hidden)
// is hidden via CSS when the browser's print dialog actually renders the
// page — see the print:hidden utility used alongside this.
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden rounded-md bg-brand px-4 py-2 text-sm font-medium text-white"
    >
      Print / Save as PDF
    </button>
  );
}
