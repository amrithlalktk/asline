import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { companyLines, fetchCompany, type CompanyInfo } from "@/lib/company";
import { formatDateTime } from "@/lib/date";

function escapeCsv(v: string) {
  return `"${v.replace(/"/g, '""')}"`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// A company/date/generated-by preamble shown on every exported report, so a
// printed copy is self-identifying without the app around it.
export async function downloadReportCsv({
  filename,
  title,
  header,
  rows,
  generatedBy,
}: {
  filename: string;
  title: string;
  header: string[];
  rows: string[][];
  generatedBy: string;
}) {
  const company = await fetchCompany();
  const preamble = [
    [company.name],
    ...companyLines(company).map((line) => [line]),
    [title],
    [`Generated on ${formatDateTime()} by ${generatedBy}`],
    [],
  ];
  const csv = [...preamble, header, ...rows]
    .map((row) => row.map((v) => escapeCsv(String(v))).join(","))
    .join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), filename);
}

// Builds the jsPDF document itself, with no browser dependency (no
// `document`/`URL` calls) — shared by the browser download below and by
// getReportPdfBuffer, which runs server-side to email the same PDF.
export function buildReportPdfDoc({
  title,
  header,
  rows,
  generatedBy,
  company,
}: {
  title: string;
  header: string[];
  rows: string[][];
  generatedBy: string;
  company: CompanyInfo;
}) {
  const doc = new jsPDF({ orientation: rows.length && header.length > 5 ? "landscape" : "portrait" });
  const marginX = 14;
  // The company address can run long enough to wrap — measure its actual
  // wrapped line count instead of assuming a fixed number of lines, so
  // everything below it (GSTIN, title, table) never overlaps it.
  const maxWidth = doc.internal.pageSize.getWidth() - marginX * 2;

  let y = 16;
  doc.setFontSize(14);
  doc.text(company.name, marginX, y);
  y += 6;

  doc.setFontSize(9);
  for (const line of companyLines(company)) {
    const wrapped = doc.splitTextToSize(line, maxWidth);
    doc.text(wrapped, marginX, y);
    y += wrapped.length * 4.5;
  }
  y += 6;

  doc.setFontSize(12);
  doc.text(title, marginX, y);
  y += 6;
  doc.setFontSize(8);
  doc.text(`Generated on ${formatDateTime()} by ${generatedBy}`, marginX, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    head: [header],
    body: rows,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 34, 49] },
  });

  return doc;
}

export async function downloadReportPdf({
  filename,
  ...opts
}: {
  filename: string;
  title: string;
  header: string[];
  rows: string[][];
  generatedBy: string;
}) {
  buildReportPdfDoc({ ...opts, company: await fetchCompany() }).save(filename);
}

// Server-side counterpart of downloadReportPdf — same document, returned as
// a Buffer instead of triggering a browser download, for emailing.
export function getReportPdfBuffer(opts: {
  title: string;
  header: string[];
  rows: string[][];
  generatedBy: string;
  company: CompanyInfo;
}) {
  return Buffer.from(buildReportPdfDoc(opts).output("arraybuffer"));
}
