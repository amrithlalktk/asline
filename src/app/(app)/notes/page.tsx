"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Card from "@/components/Card";
import type { NoteSheet } from "@/lib/types";
import { cellAddress, colToLetter, evaluateSheet } from "@/lib/spreadsheet";

const DEFAULT_ROWS = 30;
const DEFAULT_COLS = 20;
const SAVE_DELAY_MS = 600;

type CellPos = { row: number; col: number };

export default function NotesPage() {
  const [sheets, setSheets] = useState<NoteSheet[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const [cells, setCells] = useState<Record<string, string>>({});
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [cols, setCols] = useState(DEFAULT_COLS);
  const [editing, setEditing] = useState<CellPos | null>(null);
  const [editValue, setEditValue] = useState("");

  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/notes");
    const data: NoteSheet[] = await res.json();
    setSheets(data);
    setActiveId((prev) =>
      prev && data.some((s) => s.id === prev) ? prev : (data[0]?.id ?? null)
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Seed the local (editable) grid state whenever the active sheet changes —
  // deliberately not depending on `sheets` too, since that array is only
  // updated for rename/add/delete, and re-seeding on every such change would
  // clobber in-progress edits with stale data from the server.
  useEffect(() => {
    if (!activeId) return;
    const sheet = sheets.find((s) => s.id === activeId);
    if (!sheet) return;
    setCells(sheet.data.cells ?? {});
    setRows(sheet.data.rows ?? DEFAULT_ROWS);
    setCols(sheet.data.cols ?? DEFAULT_COLS);
    setEditing(null);
    dirtyRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // `sheets` is only re-fetched wholesale on load, so a debounced/flushed
  // save has to update this sheet's entry here too — otherwise switching
  // away and back re-seeds the grid (see the effect above, keyed on
  // `activeId`) from the stale copy still sitting in `sheets`, even though
  // the database already has the new value.
  function persistData(id: string, data: { rows: number; cols: number; cells: Record<string, string> }) {
    setSheets((prev) => prev.map((s) => (s.id === id ? { ...s, data } : s)));
    return fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
  }

  // Debounced auto-save of the active sheet's grid.
  useEffect(() => {
    if (!activeId || !dirtyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus("saving");
    saveTimerRef.current = setTimeout(async () => {
      dirtyRef.current = false;
      await persistData(activeId, { rows, cols, cells });
      setSaveStatus("saved");
    }, SAVE_DELAY_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [cells, rows, cols, activeId]);

  const evaluated = useMemo(() => evaluateSheet(cells), [cells]);

  function flushSave() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!activeId || !dirtyRef.current) return;
    dirtyRef.current = false;
    persistData(activeId, { rows, cols, cells });
  }

  function switchSheet(id: string) {
    if (id === activeId) return;
    flushSave();
    setActiveId(id);
  }

  async function handleAddSheet() {
    flushSave();
    const name = `Sheet ${sheets.length + 1}`;
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    const created: NoteSheet = await res.json();
    setSheets((prev) => [...prev, created]);
    setActiveId(created.id);
  }

  async function handleDeleteSheet(id: string) {
    if (!confirm("Delete this sheet? This can't be undone.")) return;
    const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    const next = sheets.filter((s) => s.id !== id);
    setSheets(next);
    if (activeId === id) {
      setActiveId(next[0]?.id ?? null);
    }
  }

  function startRename(sheet: NoteSheet) {
    setRenamingId(sheet.id);
    setRenameValue(sheet.name);
  }

  async function commitRename(id: string) {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name) return;
    const res = await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    const updated: NoteSheet = await res.json();
    setSheets((prev) => prev.map((s) => (s.id === id ? { ...s, name: updated.name } : s)));
  }

  function focusCell(row: number, col: number, rowLimit = rows, colLimit = cols) {
    const clampedRow = Math.max(0, Math.min(rowLimit - 1, row));
    const clampedCol = Math.max(0, Math.min(colLimit - 1, col));
    const address = cellAddress(clampedRow, clampedCol);
    const el = inputRefs.current.get(address);
    el?.focus();
    el?.select();
  }

  function handleCellFocus(row: number, col: number) {
    const address = cellAddress(row, col);
    setEditing({ row, col });
    setEditValue(cells[address] ?? "");
  }

  function commitEdit(row: number, col: number, value: string) {
    const address = cellAddress(row, col);
    setEditing(null);
    if ((cells[address] ?? "") === value) return;
    dirtyRef.current = true;
    setCells((prev) => {
      const next = { ...prev };
      if (value === "") delete next[address];
      else next[address] = value;
      return next;
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
      const targetRow = row + 1;
      if (targetRow >= rows) {
        dirtyRef.current = true;
        setRows((n) => n + 1);
        setTimeout(() => focusCell(targetRow, col, targetRow + 1, cols), 0);
      } else {
        focusCell(targetRow, col);
      }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      e.currentTarget.blur();
      if (e.shiftKey) {
        focusCell(row, col - 1);
        return;
      }
      const targetCol = col + 1;
      if (targetCol >= cols) {
        dirtyRef.current = true;
        setCols((n) => n + 1);
        setTimeout(() => focusCell(row, targetCol, rows, targetCol + 1), 0);
      } else {
        focusCell(row, targetCol);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.currentTarget.blur();
      focusCell(row + 1, col);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.currentTarget.blur();
      focusCell(row - 1, col);
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      e.currentTarget.blur();
      focusCell(row, col - 1);
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      e.currentTarget.blur();
      focusCell(row, col + 1);
      return;
    }
    if (e.key === "Escape") {
      setEditValue(cells[cellAddress(row, col)] ?? "");
      e.currentTarget.blur();
    }
  }

  if (loading) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Notes</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            A free-form spreadsheet — type into any cell, or start a formula with{" "}
            <code>=</code> (e.g. <code>=A1+A2</code> or <code>=SUM(A1:A5)</code>).
          </p>
        </div>
        {saveStatus !== "idle" && (
          <span className="shrink-0 text-xs text-black/50 dark:text-white/50">
            {saveStatus === "saving" ? "Saving…" : "Saved"}
          </span>
        )}
      </div>

      {sheets.length === 0 ? (
        <Card>
          <p className="mb-3 text-sm text-black/60 dark:text-white/60">
            No sheets yet.
          </p>
          <button
            type="button"
            onClick={handleAddSheet}
            className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white"
          >
            <Plus size={14} /> New sheet
          </button>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1">
            {sheets.map((s) => (
              <div key={s.id} className="flex items-center">
                {renamingId === s.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="w-28 rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15 dark:bg-transparent"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => switchSheet(s.id)}
                    onDoubleClick={() => startRename(s)}
                    title="Double-click to rename"
                    className={`rounded-md px-3 py-1.5 text-sm ${
                      s.id === activeId
                        ? "bg-brand text-white"
                        : "border border-black/15 text-black/70 hover:text-black dark:border-white/15 dark:text-white/70 dark:hover:text-white"
                    }`}
                  >
                    {s.name}
                  </button>
                )}
                {s.id === activeId && renamingId !== s.id && (
                  <button
                    type="button"
                    onClick={() => handleDeleteSheet(s.id)}
                    aria-label="Delete sheet"
                    className="ml-1 text-black/30 hover:text-[#d03b3b] dark:text-white/30"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddSheet}
              className="ml-1 flex items-center gap-1 rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/15"
            >
              <Plus size={14} /> New sheet
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                dirtyRef.current = true;
                setRows((n) => n + 10);
              }}
              className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/15"
            >
              + 10 rows
            </button>
            <button
              type="button"
              onClick={() => {
                dirtyRef.current = true;
                setCols((n) => n + 5);
              }}
              className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/15"
            >
              + 5 columns
            </button>
          </div>

          <Card className="p-0">
            <div className="overflow-auto" style={{ maxHeight: "70vh" }}>
              <table className="border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-20 min-w-10 border border-black/10 bg-black/[0.04] px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.06]" />
                    {Array.from({ length: cols }, (_, c) => (
                      <th
                        key={c}
                        className="sticky top-0 z-10 min-w-[90px] border border-black/10 bg-black/[0.04] px-2 py-1.5 text-center font-medium text-black/60 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/60"
                      >
                        {colToLetter(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: rows }, (_, r) => (
                    <tr key={r}>
                      <th className="sticky left-0 z-10 min-w-10 border border-black/10 bg-black/[0.04] px-2 py-1.5 text-center font-medium text-black/60 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/60">
                        {r + 1}
                      </th>
                      {Array.from({ length: cols }, (_, c) => {
                        const address = cellAddress(r, c);
                        const isEditing = editing?.row === r && editing?.col === c;
                        return (
                          <td key={c} className="border border-black/10 p-0 dark:border-white/10">
                            <input
                              ref={(el) => {
                                if (el) inputRefs.current.set(address, el);
                                else inputRefs.current.delete(address);
                              }}
                              value={isEditing ? editValue : (evaluated[address] ?? "")}
                              onFocus={() => handleCellFocus(r, c)}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={(e) => commitEdit(r, c, e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, r, c)}
                              className={`block w-full min-w-[90px] bg-transparent px-2 py-1.5 text-sm outline-none focus:bg-black/5 dark:focus:bg-white/10 ${
                                r === 0 ? "font-semibold" : ""
                              }`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
