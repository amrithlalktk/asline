import type { jsPDF } from "jspdf";
import type { UserOptions } from "jspdf-autotable";

// jsPDF's built-in Helvetica has no ₹ glyph: it prints "¹", spaces the
// text out and mis-measures it, so right-aligned amounts run off the page.
// Every PDF uses this embedded font instead (also registered as "bold" so
// table headers don't fall back to Helvetica).
export function applyPdfFont(doc: jsPDF, base64: string) {
  doc.addFileToVFS("Geist-Regular.ttf", base64);
  doc.addFont("Geist-Regular.ttf", "Geist", "normal");
  doc.addFont("Geist-Regular.ttf", "Geist", "bold");
  doc.setFont("Geist", "normal");
}

// Amount-like cell: "₹1,234.50", "-₹20.00", "+₹5", "12.5", "1,000 kg".
const NUMERIC = /^[-+]?\s*₹?\s*-?[\d,]+(\.\d+)?(\s*(%|kg|KG|g|L|ltr|pcs|nos|bags?|units?))?$/;

// Right-align (header included) the columns whose filled cells are all
// numbers or amounts, so figures line up under their heading.
export function numericColumnStyles(header: string[], rows: string[][]): Partial<UserOptions> {
  const right = new Set<number>();
  header.forEach((_, c) => {
    const cells = rows.map((r) => String(r[c] ?? "").trim()).filter((v) => v && v !== "—" && v !== "-");
    if (cells.length && cells.every((v) => NUMERIC.test(v))) right.add(c);
  });
  return {
    columnStyles: Object.fromEntries([...right].map((c) => [c, { halign: "right" as const }])),
    didParseCell: (data) => {
      if (data.section === "head" && right.has(data.column.index)) data.cell.styles.halign = "right";
    },
  };
}
