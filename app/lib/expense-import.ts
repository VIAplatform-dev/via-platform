// Reading a seller's own costs spreadsheet.
//
// Every store already tracks this somewhere — a spreadsheet with a date, what it was, and what it
// cost. Retyping a year of that into a form is the reason nobody fills in their costs, and without
// costs the profit and loss statement is just revenue with a nice font.
//
// So: take the file as it is. This module is the whole of the reading, and it is pure — text in,
// rows and problems out — so every awkward real-world case below is a unit test rather than
// something discovered on a seller's live data.
//
// WHAT MAKES THIS AWKWARD. Nobody's spreadsheet looks like anybody else's:
//   • Excel writes ";" as the separator in European locales, and a UTF-8 BOM at the front.
//   • Amounts arrive as "$1,234.56", "1.234,56", "(45.00)" for a negative, "45 USD", or "-".
//   • Dates arrive as ISO, as 3/4/2026 (which is March or April depending on the country), or as
//     45678 — Excel's own day-number, which is what you get when a date column is pasted as values.
//   • There are total rows, blank rows, and a title row above the headers.
// Guessing wrong here writes bad money into their books, so anything not understood becomes a
// PROBLEM the seller sees before importing, never a silent zero.

import { EXPENSE_CATEGORIES, type ExpenseCategory } from "./expenses-db.ts";

export type ImportField = "date" | "label" | "amount" | "category";

/** One row we understood, ready to become an expense. */
export type ParsedExpense = {
 row: number;          // 1-based row in the seller's file, so a problem can point at it
 occurredOn: string;   // YYYY-MM-DD
 label: string;
 amountCents: number;
 category: ExpenseCategory;
};

/** One row we could not use, and why — shown to the seller rather than dropped. */
export type ImportProblem = { row: number; reason: string; raw: string };

export type ParseResult = {
 headers: string[];
 mapping: Partial<Record<ImportField, number>>;
 expenses: ParsedExpense[];
 problems: ImportProblem[];
 /** Rows that looked like totals/subtotals and were deliberately skipped, not failures. */
 skipped: number;
};

/* ─────────────────────────────── the file ─────────────────────────────── */

/**
 * Split a delimited file into rows of cells.
 *
 * Hand-rolled rather than a dependency because the format is small and the alternative is shipping
 * a parser to run over an untrusted upload. Handles quoted fields, doubled quotes inside them,
 * newlines inside quotes, CRLF, and a leading BOM.
 */
export function parseDelimited(text: string, delimiter?: string): string[][] {
 const src = text.replace(/^﻿/, "");
 const d = delimiter || sniffDelimiter(src);
 const rows: string[][] = [];
 let row: string[] = [];
 let cell = "";
 let quoted = false;
 for (let i = 0; i < src.length; i++) {
  const c = src[i];
  if (quoted) {
   if (c === '"') {
    if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
   } else cell += c;
   continue;
  }
  if (c === '"') { quoted = true; continue; }
  if (c === d) { row.push(cell); cell = ""; continue; }
  if (c === "\r") continue;
  if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
  cell += c;
 }
 row.push(cell);
 rows.push(row);
 // Trailing newline leaves one empty row; a file of blank lines leaves several.
 return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/** Excel writes ";" in locales where "," is the decimal mark. Pick whichever wins on line one. */
export function sniffDelimiter(text: string): string {
 const line = text.replace(/^﻿/, "").split(/\r?\n/)[0] || "";
 const counts: [string, number][] = [
  [",", (line.match(/,/g) || []).length],
  [";", (line.match(/;/g) || []).length],
  ["\t", (line.match(/\t/g) || []).length],
 ];
 counts.sort((a, b) => b[1] - a[1]);
 return counts[0][1] > 0 ? counts[0][0] : ",";
}

/* ─────────────────────────────── money ─────────────────────────────── */

/**
 * A money cell to whole cents, or null if it isn't money.
 *
 * Accountants write negatives as "(45.00)" and Europeans write "1.234,56"; both mean something
 * specific and both would parse to nonsense under a naive Number().
 */
export function parseAmount(raw: string): number | null {
 let s = String(raw ?? "").trim();
 if (!s || s === "-" || s === "—") return null;
 let negative = false;
 if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
 if (/^-/.test(s)) { negative = true; s = s.slice(1); }
 s = s.replace(/[^\d.,]/g, ""); // strip $ £ €, "USD", spaces
 if (!s) return null;
 const lastComma = s.lastIndexOf(",");
 const lastDot = s.lastIndexOf(".");
 if (lastComma > -1 && lastDot > -1) {
  // Whichever comes last is the decimal separator; the other is thousands.
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
 } else if (lastComma > -1) {
  // "1,50" is a decimal; "1,500" is thousands. Two digits after the comma decides it.
  s = s.length - lastComma === 3 ? s.replace(",", ".") : s.replace(/,/g, "");
 }
 const n = Number(s);
 if (!Number.isFinite(n)) return null;
 const cents = Math.round(n * 100);
 return negative ? -cents : cents;
}

/* ─────────────────────────────── dates ─────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/**
 * A date cell to YYYY-MM-DD, or null.
 *
 * `preferDayFirst` decides 3/4/2026. It can't be inferred from one cell, so the caller looks at the
 * whole column first (see sniffDayFirst) — a column containing 13/02/2026 has settled the question
 * for every other row in it.
 */
export function parseDate(raw: string, preferDayFirst = false): string | null {
 const s = String(raw ?? "").trim();
 if (!s) return null;

 // Excel serial day-number: what you get pasting a date column as values. Day 1 is 1900-01-01, and
 // Excel believes 1900 was a leap year, so everything from March 1900 is one day out — the standard
 // 25569-day offset to the Unix epoch already absorbs that.
 if (/^\d{5}(\.\d+)?$/.test(s)) {
  const serial = Math.floor(Number(s));
  if (serial > 20000 && serial < 60000) {
   const ms = (serial - 25569) * 86400000;
   const d = new Date(ms);
   if (!Number.isNaN(d.getTime())) return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
 }

 const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
 if (isoMatch) {
  const [, y, m, d] = isoMatch;
  return valid(+y, +m, +d) ? iso(+y, +m, +d) : null;
 }

 const slash = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
 if (slash) {
  const a = +slash[1], b = +slash[2];
  let y = +slash[3];
  if (y < 100) y += y < 70 ? 2000 : 1900;
  // A value over 12 can only be the day, whatever the seller's locale.
  const dayFirst = a > 12 ? true : b > 12 ? false : preferDayFirst;
  const d = dayFirst ? a : b;
  const m = dayFirst ? b : a;
  return valid(y, m, d) ? iso(y, m, d) : null;
 }

 // "12 Mar 2026", "March 12, 2026" — let the platform handle the month names.
 //
 // But NOT a bare number. Date.parse("99999") is the year 99999, so a reference or invoice number
 // sitting in the date column would import as a real date instead of being reported as a problem.
 // Anything numeric had its chance as an Excel serial above.
 if (/^[\d.]+$/.test(s)) return null;
 const t = Date.parse(s);
 if (!Number.isNaN(t)) {
  const d = new Date(t);
  // Date.parse is lenient about the year; hold it to the same range as every other path.
  return valid(d.getFullYear(), d.getMonth() + 1, d.getDate()) ? iso(d.getFullYear(), d.getMonth() + 1, d.getDate()) : null;
 }
 return null;
}

function valid(y: number, m: number, d: number): boolean {
 if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return false;
 const dt = new Date(Date.UTC(y, m - 1, d));
 return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Does this column read as day-first? True as soon as any row has >12 in the first position. */
export function sniffDayFirst(values: readonly string[]): boolean {
 for (const v of values) {
  const m = String(v ?? "").trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (!m) continue;
  if (+m[1] > 12) return true;
  if (+m[2] > 12) return false;
 }
 return false;
}

/* ─────────────────────────────── columns ─────────────────────────────── */

const HEADER_HINTS: Record<ImportField, RegExp> = {
 date: /^(date|day|when|posted|transaction\s*date|occurred)/i,
 label: /^(desc|label|item|what|detail|memo|note|name|particular|narration|vendor|supplier|payee)/i,
 amount: /^(amount|cost|total|price|spend|spent|value|debit|charge|paid|sum)/i,
 category: /^(categor|type|class|account|bucket|group)/i,
};

/** Match each field to a column by its header. Absent fields are simply missing from the map. */
export function detectColumns(headers: readonly string[]): Partial<Record<ImportField, number>> {
 const map: Partial<Record<ImportField, number>> = {};
 const fields: ImportField[] = ["date", "amount", "label", "category"];
 const used = new Set<number>();
 for (const f of fields) {
  const i = headers.findIndex((h, idx) => !used.has(idx) && HEADER_HINTS[f].test(String(h ?? "").trim()));
  if (i > -1) { map[f] = i; used.add(i); }
 }
 return map;
}

/** Whether a row of cells reads as headers rather than data — used to find the real header row. */
export function looksLikeHeader(cells: readonly string[]): boolean {
 const m = detectColumns(cells);
 return m.amount !== undefined && (m.date !== undefined || m.label !== undefined);
}

/* ────────────────────────────── categories ────────────────────────────── */

const CATEGORY_HINTS: [ExpenseCategory, RegExp][] = [
 ["packaging", /(packag|box|mailer|tissue|dust\s*bag|ribbon|wrap|polymailer|sticker|card)/i],
 ["shipping", /(ship|postage|courier|usps|ups|fedex|dhl|royal\s*mail|label|freight)/i],
 ["marketing", /(market|advert|\bads?\b|meta|facebook|instagram|google|tiktok|promo|influenc|photo|model)/i],
 ["studio", /(rent|studio|storage|insur|utilit|electric|internet|phone|software|subscription|saas)/i],
 ["fees", /(fee|commission|stripe|paypal|depop|ebay|etsy|vestiaire|market\s*stall|pitch|table)/i],
 ["repairs", /(repair|clean|dry\s*clean|launder|tailor|alter|mend|restor|steam|cobbler)/i],
 ["sourcing", /(sourc|purchase|buy|wholesale|stock|inventory|kilo|bale|auction|estate|thrift)/i],
];

/**
 * Best guess at a category from the seller's own words.
 *
 * An explicit category cell wins if it names one of ours; otherwise the description is read. Nothing
 * recognised falls to "other", which is honest — better a cost in the wrong bucket than not counted.
 */
export function guessCategory(categoryCell: string, label: string): ExpenseCategory {
 const explicit = String(categoryCell ?? "").trim().toLowerCase();
 if (explicit) {
  const exact = EXPENSE_CATEGORIES.find((c) => c.key === explicit || c.label.toLowerCase() === explicit);
  if (exact) return exact.key;
  for (const [key, re] of CATEGORY_HINTS) if (re.test(explicit)) return key;
 }
 for (const [key, re] of CATEGORY_HINTS) if (re.test(String(label ?? ""))) return key;
 return "other";
}

/* ─────────────────────────────── the read ─────────────────────────────── */

const TOTAL_ROW = /^(total|totals|subtotal|sum|grand\s*total|balance)\b/i;

/**
 * Read a whole file into expenses and problems.
 *
 * `override` lets the seller correct the column guesses in the preview and re-read without editing
 * her file — the mapping is the only thing the UI needs to change.
 */
export function parseExpenseFile(text: string, override?: Partial<Record<ImportField, number>>): ParseResult {
 const rows = parseDelimited(text);
 if (!rows.length) return { headers: [], mapping: {}, expenses: [], problems: [], skipped: 0 };

 // A spreadsheet often opens with a title row ("Costs 2026") above the real headers.
 let headerIdx = rows.findIndex((r) => looksLikeHeader(r));
 if (headerIdx < 0) headerIdx = 0;
 const headers = rows[headerIdx].map((h) => String(h ?? "").trim());
 const mapping = { ...detectColumns(headers), ...(override || {}) };

 const body = rows.slice(headerIdx + 1);
 const expenses: ParsedExpense[] = [];
 const problems: ImportProblem[] = [];
 let skipped = 0;

 const dateCol = mapping.date;
 const dayFirst = dateCol === undefined ? false : sniffDayFirst(body.map((r) => r[dateCol] ?? ""));

 body.forEach((cells, i) => {
  const rowNo = headerIdx + 2 + i; // 1-based, counting the header
  const raw = cells.join(", ").trim();
  const first = String(cells[0] ?? "").trim();
  if (TOTAL_ROW.test(first)) { skipped++; return; }

  const amountCell = mapping.amount === undefined ? "" : cells[mapping.amount] ?? "";
  const amountCents = parseAmount(amountCell);
  if (amountCents === null) { problems.push({ row: rowNo, reason: `No amount in “${String(amountCell).trim() || "(empty)"}”`, raw }); return; }
  if (amountCents === 0) { problems.push({ row: rowNo, reason: "Amount is zero", raw }); return; }

  const label = (mapping.label === undefined ? "" : String(cells[mapping.label] ?? "")).trim() || "Cost";
  const dateCell = dateCol === undefined ? "" : String(cells[dateCol] ?? "");
  const occurredOn = parseDate(dateCell, dayFirst);
  if (!occurredOn) { problems.push({ row: rowNo, reason: `Couldn’t read the date “${dateCell.trim() || "(empty)"}”`, raw }); return; }

  expenses.push({
   row: rowNo,
   occurredOn,
   label: label.slice(0, 120),
   // A cost written as a negative is still a cost; the sign is bookkeeping, not direction.
   amountCents: Math.abs(amountCents),
   category: guessCategory(mapping.category === undefined ? "" : String(cells[mapping.category] ?? ""), label),
  });
 });

 return { headers, mapping, expenses, problems, skipped };
}

/** Anything that isn't a delimited text file — so the UI can say what to do instead of failing. */
export function looksBinary(text: string): boolean {
 // .xlsx and .numbers are ZIPs ("PK\x03\x04"); .xls is an OLE2 compound file.
 return /^PK\x03\x04/.test(text) || /^\xD0\xCF\x11\xE0/.test(text) || text.slice(0, 2000).includes("\u0000");
}
