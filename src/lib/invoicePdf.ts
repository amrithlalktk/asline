import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { companyLines, type CompanyInfo } from "@/lib/company";
import { formatBillNumber, formatCents } from "@/lib/money";
import { formatBillDate, formatDateTime } from "@/lib/date";
import type { PaymentMethod } from "@/lib/types";
import { displayUnit } from "@/lib/units";
import { billFfaAmountCents } from "@/lib/ffa";
import { applyPdfFont } from "@/lib/pdfFont";
import { PDF_FONT_BASE64 } from "@/lib/pdfFontData";

// Mirrors src/app/print/sale/[id]/page.tsx and .../purchase/[id]/page.tsx —
// same fields, same layout, so the emailed PDF matches what printing the
// bill in a browser would produce.
type InvoiceLike = {
  billNumber: number;
  date: Date | string;
  totalCents: number;
  paidCents: number;
  paymentMethod: PaymentMethod;
  account: { name: string };
  notes: string | null;
  party: {
    name: string;
    phone: string | null;
    address: string | null;
    gstNumber: string | null;
  } | null;
  items: {
    id: string;
    quantity: number;
    priceCents: number;
    ffaBonusCents?: number;
    taxPercent: number;
    taxCents: number;
    lineTotalCents: number;
    ffaGrade: string | null;
    item: { name: string; unit: string };
  }[];
  charges: { id: string; label: string; amountCents: number }[];
};

export function buildInvoicePdfBuffer(
  kind: "SALE" | "PURCHASE",
  bill: InvoiceLike,
  generatedBy: string,
  company: CompanyInfo
) {
  const doc = new jsPDF();
  applyPdfFont(doc, PDF_FONT_BASE64);
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = 16;
  doc.setFontSize(14);
  doc.text(company.name, marginX, y);
  doc.setFontSize(12);
  doc.text(kind === "SALE" ? "Sale Invoice" : "Purchase Bill", pageWidth - marginX, y, {
    align: "right",
  });
  y += 6;

  doc.setFontSize(9);
  // Company details (left) beside bill number/date (right) — continue
  // below whichever column runs longer.
  doc.text(`Bill #${formatBillNumber(bill.billNumber)}`, pageWidth - marginX, y, { align: "right" });
  doc.text(formatBillDate(bill.date), pageWidth - marginX, y + 4.5, { align: "right" });
  let leftY = y;
  for (const line of companyLines(company)) {
    const wrapped = doc.splitTextToSize(line, pageWidth / 2);
    doc.text(wrapped, marginX, leftY);
    leftY += wrapped.length * 4.5;
  }
  y = Math.max(leftY, y + 9) + 6;

  doc.setFontSize(8);
  doc.text((kind === "SALE" ? "Billed to" : "Supplier").toUpperCase(), marginX, y);
  y += 4.5;
  doc.setFontSize(10);
  doc.text(bill.party?.name ?? (kind === "SALE" ? "Cash sale" : "—"), marginX, y);
  y += 5;
  doc.setFontSize(9);
  if (bill.party?.phone) {
    doc.text(bill.party.phone, marginX, y);
    y += 4.5;
  }
  if (bill.party?.address) {
    const lines = doc.splitTextToSize(bill.party.address, pageWidth - marginX * 2);
    doc.text(lines, marginX, y);
    y += lines.length * 4.5;
  }
  if (bill.party?.gstNumber) {
    doc.text(`GSTIN: ${bill.party.gstNumber}`, marginX, y);
    y += 4.5;
  }
  y += 4;

  const rows = [
    ...bill.items.map((l) => [
      l.item.name + (l.ffaGrade ? ` (${l.ffaGrade})` : ""),
      `${l.quantity} ${displayUnit(l.item.unit)}`,
      formatCents(l.priceCents) +
        (l.ffaBonusCents
          ? `\n(${formatCents(l.priceCents - l.ffaBonusCents)} + ${formatCents(l.ffaBonusCents)} FFA)`
          : ""),
      l.taxPercent > 0 ? `${l.taxPercent}% (${formatCents(l.taxCents)})` : "—",
      formatCents(l.lineTotalCents + l.taxCents),
    ]),
    ...bill.charges.map((c) => [c.label, "", "", "", formatCents(c.amountCents)]),
  ];

  autoTable(doc, {
    startY: y,
    head: [["Item", "Qty", "Price", "Tax", "Amount"]],
    body: rows,
    styles: { fontSize: 9, font: "Geist" },
    headStyles: { fillColor: [30, 34, 49] },
    // Headings sit over their figures.
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index > 0) data.cell.styles.halign = "right";
    },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8;
  const balanceCents = bill.totalCents - bill.paidCents;
  const totalsX = pageWidth - marginX;
  const ffaCents = kind === "SALE" ? billFfaAmountCents(bill.items) : 0;
  if (ffaCents !== 0) {
    doc.setFontSize(9);
    doc.text("Sold amount (before FFA)", totalsX - 70, y);
    doc.text(formatCents(bill.totalCents - ffaCents), totalsX, y, { align: "right" });
    y += 5.5;
    doc.text("FFA addition", totalsX - 70, y);
    doc.text(`+${formatCents(ffaCents)}`, totalsX, y, { align: "right" });
    y += 5.5;
  }
  doc.setFontSize(10);
  doc.text("Total", totalsX - 40, y);
  doc.text(formatCents(bill.totalCents), totalsX, y, { align: "right" });
  y += 5.5;
  doc.setFontSize(9);
  doc.text(`Paid (${bill.account.name})`, totalsX - 40, y);
  doc.text(formatCents(bill.paidCents), totalsX, y, { align: "right" });
  y += 5.5;
  doc.setFontSize(10);
  doc.text("Balance", totalsX - 40, y);
  doc.text(
    balanceCents > 0 ? formatCents(balanceCents) : "Paid in full",
    totalsX,
    y,
    { align: "right" }
  );
  y += 8;

  if (bill.notes) {
    doc.setFontSize(9);
    const noteLines = doc.splitTextToSize(bill.notes, pageWidth - marginX * 2);
    doc.text(noteLines, marginX, y);
    y += noteLines.length * 4.5;
  }

  doc.setFontSize(7);
  doc.text(`Generated on ${formatDateTime()} by ${generatedBy}`, marginX, y + 6);

  return Buffer.from(doc.output("arraybuffer"));
}
