import { test } from "node:test";
import assert from "node:assert/strict";
import {
 parseDelimited, sniffDelimiter, parseAmount, parseDate, sniffDayFirst,
 detectColumns, guessCategory, parseExpenseFile, looksBinary,
} from "./expense-import.ts";

/* ── the file ───────────────────────────────────────────────────────────── */

test("quoted cells keep their commas", () => {
 const rows = parseDelimited('a,b\n"Smith, John",5\n');
 assert.deepEqual(rows[1], ["Smith, John", "5"]);
});

test("a doubled quote inside a quoted cell is one quote", () => {
 assert.deepEqual(parseDelimited('x\n"say ""hi"""\n')[1], ['say "hi"']);
});

test("a newline inside quotes doesn't end the row", () => {
 const rows = parseDelimited('a,b\n"line one\nline two",9\n');
 assert.equal(rows.length, 2);
 assert.equal(rows[1][1], "9");
});

test("CRLF and blank lines are handled", () => {
 assert.equal(parseDelimited("a,b\r\n1,2\r\n\r\n").length, 2);
});

test("a BOM doesn't corrupt the first header", () => {
 // Excel writes one on every CSV it exports; without stripping it the first column never matches.
 const rows = parseDelimited("﻿Date,Amount\n2026-01-02,5\n");
 assert.equal(rows[0][0], "Date");
});

test("semicolon files are detected", () => {
 assert.equal(sniffDelimiter("Date;Desc;Amount"), ";");
 assert.equal(sniffDelimiter("Date,Desc,Amount"), ",");
 assert.equal(sniffDelimiter("Date\tDesc\tAmount"), "\t");
});

/* ── money ──────────────────────────────────────────────────────────────── */

test("currency symbols and thousands separators", () => {
 assert.equal(parseAmount("$1,234.56"), 123456);
 assert.equal(parseAmount("£45"), 4500);
 assert.equal(parseAmount("45 USD"), 4500);
});

test("European decimals", () => {
 assert.equal(parseAmount("1.234,56"), 123456);
 assert.equal(parseAmount("1,50"), 150);
 assert.equal(parseAmount("1,500"), 150000); // thousands, not 1.5
});

test("accountants' parentheses are negative", () => {
 assert.equal(parseAmount("(45.00)"), -4500);
 assert.equal(parseAmount("-45"), -4500);
});

test("empty and dash cells are not amounts", () => {
 assert.equal(parseAmount(""), null);
 assert.equal(parseAmount("-"), null);
 assert.equal(parseAmount("n/a"), null);
});

/* ── dates ──────────────────────────────────────────────────────────────── */

test("ISO dates", () => {
 assert.equal(parseDate("2026-03-04"), "2026-03-04");
 assert.equal(parseDate("2026/03/04"), "2026-03-04");
});

test("slash dates follow the locale hint", () => {
 assert.equal(parseDate("3/4/2026", false), "2026-03-04"); // US: March 4
 assert.equal(parseDate("3/4/2026", true), "2026-04-03");  // UK: 3 April
});

test("a day over 12 settles it regardless of the hint", () => {
 assert.equal(parseDate("13/02/2026", false), "2026-02-13");
 assert.equal(parseDate("02/13/2026", true), "2026-02-13");
});

test("two-digit years", () => {
 assert.equal(parseDate("1/2/26"), "2026-01-02");
 assert.equal(parseDate("1/2/99"), "1999-01-02");
});

test("Excel serial day-numbers", () => {
 // What a date column becomes when it's pasted as values. 45678 days from Excel's epoch, via the
 // standard 25569-day offset to 1970-01-01, is 2025-01-21.
 assert.equal(parseDate("45678"), "2025-01-21");
 // The guard only accepts a plausible range, so a five-digit invoice number isn't read as a date.
 assert.equal(parseDate("99999"), null);
});

test("impossible dates are rejected, not rounded", () => {
 assert.equal(parseDate("2026-02-30"), null);
 assert.equal(parseDate("not a date"), null);
 assert.equal(parseDate(""), null);
});

test("a column is read as day-first once any row proves it", () => {
 assert.equal(sniffDayFirst(["3/4/2026", "13/02/2026"]), true);
 assert.equal(sniffDayFirst(["3/4/2026", "02/13/2026"]), false);
 assert.equal(sniffDayFirst(["3/4/2026"]), false); // ambiguous → US default
});

/* ── columns and categories ─────────────────────────────────────────────── */

test("headers are matched by name, in any order", () => {
 const m = detectColumns(["Description", "Amount", "Date"]);
 assert.equal(m.label, 0);
 assert.equal(m.amount, 1);
 assert.equal(m.date, 2);
});

test("one column is never claimed by two fields", () => {
 // "Total" matches amount; it must not also be taken as the label.
 const m = detectColumns(["Date", "Total"]);
 assert.equal(m.amount, 1);
 assert.notEqual(m.label, 1);
});

test("categories come from the seller's own words", () => {
 assert.equal(guessCategory("", "Dust bags x50"), "packaging");
 assert.equal(guessCategory("", "USPS postage"), "shipping");
 assert.equal(guessCategory("", "Dry cleaning"), "repairs");
 assert.equal(guessCategory("", "Studio rent"), "studio");
 assert.equal(guessCategory("", "Depop fees"), "fees");
 assert.equal(guessCategory("", "something unrecognisable"), "other");
});

test("an explicit category column wins over the description", () => {
 assert.equal(guessCategory("Packaging & packing", "USPS postage"), "packaging");
 assert.equal(guessCategory("marketing", "boxes"), "marketing");
});

/* ── whole files ────────────────────────────────────────────────────────── */

test("a plain sheet reads end to end", () => {
 const r = parseExpenseFile("Date,Description,Amount\n2026-01-02,Dust bags,45.00\n2026-01-03,USPS postage,\"$1,200.50\"\n");
 assert.equal(r.problems.length, 0);
 assert.equal(r.expenses.length, 2);
 assert.deepEqual(
  r.expenses.map((e) => [e.occurredOn, e.label, e.amountCents, e.category]),
  [["2026-01-02", "Dust bags", 4500, "packaging"], ["2026-01-03", "USPS postage", 120050, "shipping"]],
 );
});

test("a title row above the headers is skipped", () => {
 const r = parseExpenseFile("My costs 2026,,\nDate,Description,Amount\n2026-01-02,Boxes,10\n");
 assert.equal(r.headers[0], "Date");
 assert.equal(r.expenses.length, 1);
});

test("total rows are skipped, not reported as failures", () => {
 const r = parseExpenseFile("Date,Description,Amount\n2026-01-02,Boxes,10\nTotal,,10\n");
 assert.equal(r.expenses.length, 1);
 assert.equal(r.skipped, 1);
 assert.equal(r.problems.length, 0);
});

test("unreadable rows become problems that name the row and the reason", () => {
 const r = parseExpenseFile("Date,Description,Amount\nnonsense,Boxes,10\n2026-01-02,Boxes,abc\n");
 assert.equal(r.expenses.length, 0);
 assert.equal(r.problems.length, 2);
 assert.equal(r.problems[0].row, 2); // 1-based, counting the header
 assert.match(r.problems[0].reason, /date/i);
 assert.match(r.problems[1].reason, /amount/i);
});

test("a cost entered as a negative is still a cost", () => {
 const r = parseExpenseFile("Date,Description,Amount\n2026-01-02,Boxes,(10.00)\n");
 assert.equal(r.expenses[0].amountCents, 1000);
});

test("the seller can override a wrong column guess", () => {
 // Two plausible amount columns; she picks the second.
 const csv = "Date,Amount,Total\n2026-01-02,5,9\n";
 assert.equal(parseExpenseFile(csv).expenses[0].amountCents, 500);
 assert.equal(parseExpenseFile(csv, { amount: 2 }).expenses[0].amountCents, 900);
});

test("a semicolon file with European money and dates reads correctly", () => {
 const r = parseExpenseFile("﻿Date;Description;Amount\n13/02/2026;Verpackung;1.234,56\n");
 assert.equal(r.expenses.length, 1);
 assert.equal(r.expenses[0].occurredOn, "2026-02-13");
 assert.equal(r.expenses[0].amountCents, 123456);
});

test("a real spreadsheet is recognised as binary so the UI can say what to do", () => {
 assert.equal(looksBinary("PK\x03\x04rest of an xlsx"), true);
 assert.equal(looksBinary("Date,Amount\n2026-01-02,5\n"), false);
});
