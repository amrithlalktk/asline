// A small, self-contained formula engine for the Notes spreadsheet — cell
// references (A1), ranges (A1:B5) inside SUM/AVERAGE/MIN/MAX/COUNT, the four
// arithmetic operators, and parentheses. Deliberately not a full Excel
// clone: no string functions, no absolute references, no cross-sheet refs.

export const ERROR_VALUE = "#ERROR!";
export const CIRCULAR_VALUE = "#CIRCULAR!";

// Thrown when a formula reads a cell that already resolved to an error/
// circular marker, so that marker propagates through the caller's own
// result instead of being flattened into a generic ERROR_VALUE by the
// catch-all in evaluateSheet.
class PropagatedMarkerError extends Error {
  constructor(public readonly marker: string) {
    super(marker);
  }
}

export function colToLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function letterToCol(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

export function cellAddress(row: number, col: number): string {
  return `${colToLetter(col)}${row + 1}`;
}

const CELL_REF_RE = /^([A-Za-z]+)([0-9]+)$/;

export function parseCellRef(ref: string): { row: number; col: number } | null {
  const match = CELL_REF_RE.exec(ref);
  if (!match) return null;
  const row = Number(match[2]) - 1;
  const col = letterToCol(match[1]);
  if (row < 0) return null;
  return { row, col };
}

type Token =
  | { type: "num"; value: number }
  | { type: "ref"; value: string }
  | { type: "ident"; value: string }
  | { type: "op"; value: "+" | "-" | "*" | "/" | "(" | ")" | ":" | "," };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const num = Number(expr.slice(i, j));
      if (Number.isNaN(num)) throw new Error("Invalid number");
      tokens.push({ type: "num", value: num });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      let j = i;
      while (j < expr.length && /[A-Za-z]/.test(expr[j])) j++;
      const letters = expr.slice(i, j);
      let k = j;
      while (k < expr.length && /[0-9]/.test(expr[k])) k++;
      if (k > j) {
        tokens.push({ type: "ref", value: (letters + expr.slice(j, k)).toUpperCase() });
        i = k;
      } else {
        tokens.push({ type: "ident", value: letters.toUpperCase() });
        i = j;
      }
      continue;
    }
    if ("+-*/():,".includes(c)) {
      tokens.push({ type: "op", value: c as "+" | "-" | "*" | "/" | "(" | ")" | ":" | "," });
      i++;
      continue;
    }
    throw new Error(`Unexpected character: ${c}`);
  }
  return tokens;
}

const FUNCTIONS = new Set(["SUM", "AVERAGE", "MIN", "MAX", "COUNT"]);

class Parser {
  private pos = 0;
  constructor(
    private tokens: Token[],
    private resolveCell: (address: string) => string
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private isOp(t: Token | undefined, value: string): boolean {
    return !!t && t.type === "op" && t.value === value;
  }

  private expectOp(value: string) {
    const t = this.tokens[this.pos];
    if (!this.isOp(t, value)) throw new Error(`Expected "${value}"`);
    this.pos++;
  }

  parse(): number {
    const value = this.parseExpression();
    if (this.pos !== this.tokens.length) throw new Error("Unexpected trailing input");
    return value;
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    while (this.isOp(this.peek(), "+") || this.isOp(this.peek(), "-")) {
      const op = (this.tokens[this.pos] as Extract<Token, { type: "op" }>).value;
      this.pos++;
      const rhs = this.parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    while (this.isOp(this.peek(), "*") || this.isOp(this.peek(), "/")) {
      const op = (this.tokens[this.pos] as Extract<Token, { type: "op" }>).value;
      this.pos++;
      const rhs = this.parseFactor();
      value = op === "*" ? value * rhs : value / rhs;
    }
    return value;
  }

  private parseFactor(): number {
    const t = this.peek();
    if (!t) throw new Error("Unexpected end of expression");
    if (this.isOp(t, "-")) {
      this.pos++;
      return -this.parseFactor();
    }
    if (this.isOp(t, "(")) {
      this.pos++;
      const value = this.parseExpression();
      this.expectOp(")");
      return value;
    }
    if (t.type === "num") {
      this.pos++;
      return t.value;
    }
    if (t.type === "ref") {
      this.pos++;
      return this.numFromCell(t.value);
    }
    if (t.type === "ident") {
      if (!FUNCTIONS.has(t.value)) throw new Error(`Unknown function ${t.value}`);
      this.pos++;
      this.expectOp("(");
      const values = this.parseFunctionArgs();
      this.expectOp(")");
      return applyFunction(t.value, values);
    }
    throw new Error("Unexpected token");
  }

  private parseFunctionArgs(): number[] {
    const values: number[] = [];
    if (this.isOp(this.peek(), ")")) return values;
    for (;;) {
      values.push(...this.parseFunctionArg());
      if (this.isOp(this.peek(), ",")) {
        this.pos++;
        continue;
      }
      break;
    }
    return values;
  }

  private parseFunctionArg(): number[] {
    const start = this.pos;
    const t = this.peek();
    if (t && t.type === "ref") {
      const t2 = this.tokens[this.pos + 1];
      if (t2 && this.isOp(t2, ":")) {
        const t3 = this.tokens[this.pos + 2];
        if (t3 && t3.type === "ref") {
          this.pos += 3;
          return this.numsFromRange(t.value, t3.value);
        }
      }
    }
    this.pos = start;
    return [this.parseExpression()];
  }

  private numFromCell(address: string): number {
    const raw = this.resolveCell(address);
    if (raw === ERROR_VALUE || raw === CIRCULAR_VALUE) throw new PropagatedMarkerError(raw);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  private numsFromRange(fromRef: string, toRef: string): number[] {
    const a = parseCellRef(fromRef);
    const b = parseCellRef(toRef);
    if (!a || !b) throw new Error("Invalid range");
    const minRow = Math.min(a.row, b.row);
    const maxRow = Math.max(a.row, b.row);
    const minCol = Math.min(a.col, b.col);
    const maxCol = Math.max(a.col, b.col);
    const values: number[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        values.push(this.numFromCell(cellAddress(r, c)));
      }
    }
    return values;
  }
}

function applyFunction(name: string, values: number[]): number {
  switch (name) {
    case "SUM":
      return values.reduce((a, b) => a + b, 0);
    case "AVERAGE":
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    case "MIN":
      return values.length ? Math.min(...values) : 0;
    case "MAX":
      return values.length ? Math.max(...values) : 0;
    case "COUNT":
      return values.length;
    default:
      throw new Error(`Unknown function ${name}`);
  }
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return ERROR_VALUE;
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded);
}

// Evaluates every formula cell in `cells` (raw strings, "=..." = formula,
// anything else shown as-is) into its displayed value, resolving cell
// references recursively with memoization and circular-reference detection.
export function evaluateSheet(cells: Record<string, string>): Record<string, string> {
  const cache = new Map<string, string>();
  const inProgress = new Set<string>();

  function evalCell(address: string): string {
    if (cache.has(address)) return cache.get(address)!;
    const raw = cells[address];
    if (raw === undefined || raw === "") {
      cache.set(address, "");
      return "";
    }
    if (!raw.startsWith("=")) {
      cache.set(address, raw);
      return raw;
    }
    if (inProgress.has(address)) return CIRCULAR_VALUE;
    inProgress.add(address);
    let result: string;
    try {
      const parser = new Parser(tokenize(raw.slice(1)), evalCell);
      result = formatNumber(parser.parse());
    } catch (err) {
      result = err instanceof PropagatedMarkerError ? err.marker : ERROR_VALUE;
    }
    inProgress.delete(address);
    cache.set(address, result);
    return result;
  }

  const result: Record<string, string> = {};
  for (const address of Object.keys(cells)) {
    result[address] = evalCell(address);
  }
  return result;
}
