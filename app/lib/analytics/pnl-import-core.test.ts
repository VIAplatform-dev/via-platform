import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMoney, parseDate, detectDayFirst, detectDelimiter, splitLine, mapHeaders, parseLedgerCsv, summarise } from "./pnl-import-core.ts";

// ── money ──────────────────────────────────────────────────────────────────────────────────────
test("plain amounts", () => {
 assert.equal(parseMoney("45"), 4_500);
 assert.equal(parseMoney("45.50"), 4_550);
 assert.equal(parseMoney("0"), 0);
});

test("currency symbols and thousands separators", () => {
 assert.equal(parseMoney("$1,234.56"), 123_456);
 assert.equal(parseMoney("£45"), 4_500);
 assert.equal(parseMoney("€1.234,56"), 123_456); // European: last separator is the decimal
});

test("accountants' brackets are negative — every ledger export writes them", () => {
 assert.equal(parseMoney("(45.00)"), -4_500);
 assert.equal(parseMoney("-45"), -4_500);
 assert.equal(parseMoney("45-"), -4_500);
});

test("things that aren't money are null, not zero", () => {
 // A totals row or a note must be skippable; counting it as 0 hides it.
 assert.equal(parseMoney(""), null);
 assert.equal(parseMoney("TOTAL"), null);
 assert.equal(parseMoney("n/a"), null);
});

// ── dates ──────────────────────────────────────────────────────────────────────────────────────
test("ISO dates", () => {
 assert.equal(parseDate("2026-03-14", false), "2026-03-14");
 assert.equal(parseDate("2026/3/4", false), "2026-03-04");
});

test("slash dates follow the file's own convention", () => {
 assert.equal(parseDate("03/04/2026", false), "2026-03-04"); // month first
 assert.equal(parseDate("03/04/2026", true), "2026-04-03");  // day first
});

test("a value above 12 settles the order whatever the guess said", () => {
 assert.equal(parseDate("14/03/2026", false), "2026-03-14");
 assert.equal(parseDate("03/14/2026", true), "2026-03-14");
});

test("two-digit years", () => {
 assert.equal(parseDate("01/05/26", false), "2026-01-05");
 assert.equal(parseDate("01/05/99", false), "1999-01-05");
});

test("named months", () => {
 assert.equal(parseDate("5 Mar 2026", false), "2026-03-05");
 assert.equal(parseDate("March 5, 2026", false), "2026-03-05");
});

test("nonsense is null", () => {
 assert.equal(parseDate("later", false), null);
 assert.equal(parseDate("", false), null);
});

test("day-first is detected from the file, not assumed", () => {
 assert.equal(detectDayFirst(["03/04/2026", "14/05/2026"]), true);
 assert.equal(detectDayFirst(["03/04/2026", "05/14/2026"]), false);
 assert.equal(detectDayFirst(["03/04/2026"]), false); // nothing proves it — keep the safe default
 // Dots are the European way of writing it: 04.03.2026 is 4 March, and reading it as 3 April would
 // move her takings into the wrong month silently.
 assert.equal(detectDayFirst(["04.03.2026"]), true);
 assert.equal(detectDayFirst(["03/14/2026", "04.03.2026"]), false); // proof still beats the hint
});

// ── the file ───────────────────────────────────────────────────────────────────────────────────
test("delimiter is whichever the header actually uses", () => {
 assert.equal(detectDelimiter("a,b,c"), ",");
 assert.equal(detectDelimiter("a;b;c"), ";");
 assert.equal(detectDelimiter("a\tb\tc"), "\t");
});

test("a quoted comma doesn't split the field", () => {
 assert.deepEqual(splitLine('2026-01-01,"Coat, black",45', ","), ["2026-01-01", "Coat, black", "45"]);
});

test("a doubled quote inside a quoted field is one quote", () => {
 assert.deepEqual(splitLine('a,"say ""hi""",b', ","), ["a", 'say "hi"', "b"]);
});

test("headers are recognised under the names people actually use", () => {
 const m = mapHeaders(["Date", "Item", "Cost", "Sold For"]);
 assert.equal(m.date, 0);
 assert.equal(m.label, 1);
 assert.equal(m.amountOut, 2);
 assert.equal(m.amountIn, 3);
});

// ── whole files ────────────────────────────────────────────────────────────────────────────────
test("a resale ledger gives BOTH halves of each line", () => {
 // She bought a coat for 40 and sold it for 120. A P&L needs both, not the difference.
 const csv = "Date,Item,Cost,Sold For\n2026-03-04,Wool coat,40,120\n";
 const r = parseLedgerCsv(csv);
 assert.equal(r.rows.length, 2);
 assert.deepEqual(r.rows.map((x) => [x.direction, x.amountCents]), [["in", 12_000], ["out", 4_000]]);
 assert.equal(r.rows[0].label, "Wool coat");
});

test("a single signed column reads like a bank export", () => {
 const csv = "Date,Description,Amount\n2026-03-04,Booth fee,-45\n2026-03-05,Sale,120\n";
 const r = parseLedgerCsv(csv);
 assert.deepEqual(r.rows.map((x) => [x.direction, x.amountCents]), [["out", 4_500], ["in", 12_000]]);
});

test("a row with no readable date is reported, never silently dropped", () => {
 const csv = "Date,Item,Amount\n2026-03-04,Coat,40\nTOTAL,,40\n";
 const r = parseLedgerCsv(csv);
 assert.equal(r.rows.length, 1);
 assert.equal(r.skipped.length, 1);
 assert.match(r.skipped[0].reason, /date/i);
 assert.equal(r.skipped[0].line, 3);
});

test("a row with a date but no amount is reported too", () => {
 const csv = "Date,Item,Amount\n2026-03-04,Coat,\n";
 const r = parseLedgerCsv(csv);
 assert.equal(r.rows.length, 0);
 assert.match(r.skipped[0].reason, /amount/i);
});

test("a line with no description still imports, named so she can find it", () => {
 const r = parseLedgerCsv("Date,Amount\n2026-03-04,40\n");
 assert.equal(r.rows[0].label, "Imported");
});

test("the file's own date convention is applied to every row", () => {
 // One unambiguous 14/03 proves the whole file is day-first, including 03/04.
 const csv = "Date,Item,Amount\n14/03/2026,A,10\n03/04/2026,B,10\n";
 const r = parseLedgerCsv(csv);
 assert.equal(r.dayFirst, true);
 assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-14", "2026-04-03"]);
});

test("she can overrule the guess", () => {
 const csv = "Date,Item,Amount\n03/04/2026,B,10\n";
 assert.equal(parseLedgerCsv(csv, { dayFirst: true }).rows[0].date, "2026-04-03");
 assert.equal(parseLedgerCsv(csv, { dayFirst: false }).rows[0].date, "2026-03-04");
});

test("semicolons and European money together", () => {
 const csv = "Date;Item;Cost\n04.03.2026;Mantel;1.234,56\n";
 const r = parseLedgerCsv(csv);
 assert.equal(r.rows[0].amountCents, 123_456);
 assert.equal(r.rows[0].date, "2026-03-04");
});

test("an empty file is empty, not a crash", () => {
 assert.deepEqual(parseLedgerCsv("").rows, []);
 assert.deepEqual(parseLedgerCsv("\n\n").rows, []);
});

test("the summary is what she is about to commit", () => {
 const r = parseLedgerCsv("Date,Item,Cost,Sold For\n2026-03-04,Coat,40,120\n2026-01-02,Bag,10,30\n");
 const s = summarise(r.rows);
 assert.equal(s.count, 4);
 assert.equal(s.inCents, 15_000);
 assert.equal(s.outCents, 5_000);
 assert.equal(s.from, "2026-01-02");
 assert.equal(s.to, "2026-03-04");
});
