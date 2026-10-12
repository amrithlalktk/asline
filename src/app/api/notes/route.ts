import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { noteSheetSchema } from "@/lib/validation";
import { cellAddress } from "@/lib/spreadsheet";
import type { NoteSheetData } from "@/lib/types";

const DEFAULT_ROWS = 30;
const DEFAULT_COLS = 20;

// Every new sheet starts with this header row — matches the columns this
// business actually tracks per bill, so a blank sheet is ready to use
// immediately instead of needing the same headers typed in by hand every
// time.
const DEFAULT_HEADERS = [
  "Bill Number",
  "Date",
  "Party",
  "Item",
  "Bill Amount",
  "Tax",
  "Lorry Rent",
  "Cash Balance",
];

function defaultCells(): Record<string, string> {
  const cells: Record<string, string> = {};
  DEFAULT_HEADERS.forEach((label, col) => {
    cells[cellAddress(0, col)] = label;
  });
  return cells;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sheets = await db.noteSheet.findMany({ orderBy: { order: "asc" } });
  return NextResponse.json(sheets);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = noteSheetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const last = await db.noteSheet.aggregate({ _max: { order: true } });
  const data: NoteSheetData = {
    rows: DEFAULT_ROWS,
    cols: DEFAULT_COLS,
    cells: defaultCells(),
  };
  const sheet = await db.noteSheet.create({
    data: {
      name: parsed.data.name,
      order: (last._max.order ?? 0) + 1,
      data,
    },
  });

  return NextResponse.json(sheet);
}
