// Reading a seller's own spreadsheet.
//
// Every vintage shop kept books before VYA existed, and they are all a CSV export of the same
// four ideas in a different order: when, what, what it cost me, what it sold for. This turns one of
// those into rows VYA can add up, WITHOUT asking her to reformat anything first — a mapping screen
// that demands "rename your columns to date/amount/category" is a screen people close.
//
// Pure: no I/O, no database. Every guess it makes is reported back so the import screen can show her
// what it read and let her correct it before a single row is written.

export type MoneyDirection = "in" | "out";

export type ParsedRow = {
 /** ISO yyyy-mm-dd. */
 date: string;
 label: string;
 amountCents: number;
 direction: MoneyDirection;
 /** The line as it appeared, so a preview can show her the source of anything odd. */
 raw: string[];
};

export type ParseResult = {
 rows: ParsedRow[];
 /** Header names as found, in file order. */
 headers: string[];
 /** Which header index was read as what. -1 when the file had no such column. */
 mapping: { date: number; label: number; amountIn: number; amountOut: number; amount: number };
 /** Rows we could not read, with the reason — never silently dropped. */
 skipped: { line: number; reason: string; raw: string }[];
 /** True when dates read as day-first (14/03/2026). Reported because it is a guess. */
 dayFirst: boolean;
};

// ── the small readers ──────────────────────────────────────────────────────────────────────────

/** Split one CSV line, honouring quotes and doubled quotes inside them. */
export function splitLine(line: string, delim: string): string[] {
 const out: string[] = [];
 let cur = "";
 let quoted = false;
 for (let i = 0; i < line.length; i++) {
  const c = line[i];
  if (quoted) {
   if (c === '"') {
    if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
   } else cur += c;
  } else if (c === '"') quoted = true;
  else if (c === delim) { out.push(cur); cur = ""; }
  else cur += c;
 }
 out.push(cur);
 return out.map((s) => s.trim());
}

/** Comma, semicolon or tab — whichever appears most on the header line. */
export function detectDelimiter(headerLine: string): string {
 const counts = [",", ";", "\t"].map((d) => ({ d, n: (headerLine.match(new RegExp(`\\${d}`, "g")) || []).length }));
 counts.sort((a, b) => b.n - a.n);
 return counts[0].n > 0 ? counts[0].d : ",";
}

/**
 * Money, in cents, however her spreadsheet wrote it.
 *
 * Handles a currency symbol, thousands separators, a trailing minus, and accountants' brackets —
 * "(45.00)" is minus forty-five in every ledger ever exported. Returns null for anything that isn't
 * a number, so a total row or a note can be skipped rather than counted as zero.
 */
export function parseMoney(raw: string): number | null {
 let s = String(raw ?? "").trim();
 if (!s) return null;
 let negative = false;
 if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
 if (/-\s*$/.test(s)) { negative = true; s = s.replace(/-\s*$/, ""); }
 s = s.replace(/[^\d.,\-]/g, "");           // drop £ $ € and stray words
 if (s.startsWith("-")) { negative = true; s = s.slice(1); }
 if (!s || !/\d/.test(s)) return null;
 // "1.234,56" (European) vs "1,234.56" — the LAST separator is the decimal one.
 const lastComma = s.lastIndexOf(",");
 const lastDot = s.lastIndexOf(".");
 if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
 else s = s.replace(/,/g, "");
 const n = Number(s);
 if (!Number.isFinite(n)) return null;
 return Math.round(n * 100) * (negative ? -1 : 1);
}

const MONTHS: Record<string, number> = {
 jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** A date, however she wrote it. `dayFirst` decides 03/04 when the file is ambiguous. */
export function parseDate(raw: string, dayFirst: boolean): string | null {
 const s = String(raw ?? "").trim();
 if (!s) return null;
 const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
 if (iso) return ymd(+iso[1], +iso[2], +iso[3]);
 const named = s.match(/^(\d{1,2})?\s*([a-z]{3,9})\.?,?\s*(\d{1,2})?,?\s*(\d{2,4})$/i);
 if (named) {
  const m = MONTHS[named[2].slice(0, 4).toLowerCase()] ?? MONTHS[named[2].slice(0, 3).toLowerCase()];
  const d = named[1] ? +named[1] : named[3] ? +named[3] : 1;
  if (m) return ymd(year(+named[4]), m, d);
 }
 const num = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
 if (num) {
  const a = +num[1], b = +num[2];
  // A value above 12 settles it whatever the file-wide guess said.
  const day = a > 12 ? a : b > 12 ? b : (dayFirst ? a : b);
  const mon = a > 12 ? b : b > 12 ? a : (dayFirst ? b : a);
  if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) return ymd(year(+num[3]), mon, day);
 }
 return null;
}
const year = (y: number) => (y < 100 ? (y > 70 ? 1900 + y : 2000 + y) : y);
const ymd = (y: number, m: number, d: number) =>
 `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Does this file write dates day-first?
 *
 * Proof first: any value above 12 in one position settles it for the whole file. Failing that, DOTS
 * decide — `04.03.2026` is the European way of writing it and means 4 March, and reading it as
 * 3 April would move a seller's takings into the wrong month without a word.
 */
export function detectDayFirst(values: string[]): boolean {
 let dotted = false;
 for (const v of values) {
  const m = String(v).match(/^(\d{1,2})([-/.])(\d{1,2})[-/.]\d{2,4}$/);
  if (!m) continue;
  if (+m[1] > 12) return true;   // 14/03 — first field is the day
  if (+m[3] > 12) return false;  // 03/14 — second field is the day
  if (m[2] === ".") dotted = true;
 }
 return dotted;
}

// ── working out which column is which ──────────────────────────────────────────────────────────

const HEAD = {
 date: /^(date|day|when|sold on|sold date|order date|purchase date|transaction date)$/i,
 label: /^(item|description|desc|name|title|piece|product|details?|memo|notes?|what)$/i,
 amountIn: /^(revenue|sale|sold|sold for|sale price|income|price|gross|amount in|money in|credit|total sale)$/i,
 amountOut: /^(cost|spend|spent|expense|expenses|paid|amount out|money out|debit|cost of goods|cogs|purchase price)$/i,
 amount: /^(amount|value|total|net|sum)$/i,
};

export function mapHeaders(headers: string[]): ParseResult["mapping"] {
 const find = (re: RegExp) => headers.findIndex((h) => re.test(h.trim()));
 return {
  date: find(HEAD.date),
  label: find(HEAD.label),
  amountIn: find(HEAD.amountIn),
  amountOut: find(HEAD.amountOut),
  amount: find(HEAD.amount),
 };
}

/**
 * Read a whole file.
 *
 * A sheet with both a cost and a sale column produces TWO rows per line — money out and money in —
 * which is what a resale ledger actually records: she bought a coat for 40 and sold it for 120, and
 * a P&L needs both halves, not the difference.
 */
export function parseLedgerCsv(text: string, opts: { dayFirst?: boolean } = {}): ParseResult {
 const lines = String(text ?? "").split(/\r?\n/).filter((l) => l.trim() !== "");
 if (!lines.length) return { rows: [], headers: [], mapping: { date: -1, label: -1, amountIn: -1, amountOut: -1, amount: -1 }, skipped: [], dayFirst: false };

 const delim = detectDelimiter(lines[0]);
 const headers = splitLine(lines[0], delim);
 const mapping = mapHeaders(headers);
 const body = lines.slice(1).map((l) => splitLine(l, delim));

 const dayFirst = opts.dayFirst ?? (mapping.date >= 0 ? detectDayFirst(body.map((c) => c[mapping.date] ?? "")) : false);

 const rows: ParsedRow[] = [];
 const skipped: ParseResult["skipped"] = [];

 body.forEach((cells, i) => {
  const line = i + 2; // 1-based, and the header took line 1
  const rawLine = cells.join(delim === "\t" ? "\t" : delim);
  const date = mapping.date >= 0 ? parseDate(cells[mapping.date] ?? "", dayFirst) : null;
  if (!date) { skipped.push({ line, reason: "No date we could read", raw: rawLine }); return; }
  const label = (mapping.label >= 0 ? cells[mapping.label] : "")?.trim() || "Imported";

  let added = 0;
  const push = (cents: number | null, direction: MoneyDirection) => {
   if (cents == null || cents === 0) return;
   rows.push({ date, label, amountCents: Math.abs(cents), direction, raw: cells });
   added++;
  };
  if (mapping.amountIn >= 0) push(parseMoney(cells[mapping.amountIn] ?? ""), "in");
  if (mapping.amountOut >= 0) push(parseMoney(cells[mapping.amountOut] ?? ""), "out");
  if (mapping.amountIn < 0 && mapping.amountOut < 0 && mapping.amount >= 0) {
   // One signed column: negative is money out, the way a bank export writes it.
   const cents = parseMoney(cells[mapping.amount] ?? "");
   if (cents != null && cents !== 0) push(cents, cents < 0 ? "out" : "in");
  }
  if (added === 0) skipped.push({ line, reason: "No amount we could read", raw: rawLine });
 });

 return { rows, headers, mapping, skipped, dayFirst };
}

/** What the seller is about to commit, so the screen can say it before she does. */
export function summarise(rows: ParsedRow[]): { count: number; inCents: number; outCents: number; from: string | null; to: string | null } {
 let inCents = 0, outCents = 0, from: string | null = null, to: string | null = null;
 for (const r of rows) {
  if (r.direction === "in") inCents += r.amountCents; else outCents += r.amountCents;
  if (!from || r.date < from) from = r.date;
  if (!to || r.date > to) to = r.date;
 }
 return { count: rows.length, inCents, outCents, from, to };
}
