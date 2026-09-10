import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrid, monthSpan, monthLabel, gridToCsv, type LedgerEntry } from "./pnl-grid.ts";

const ROWS = [
 { key: "revenue", label: "Revenue", direction: "in" as const },
 { key: "cogs", label: "Cost of goods", direction: "out" as const },
 { key: "expenses", label: "Expenses", direction: "out" as const },
];
const e = (date: string, rowKey: string, amountCents: number, direction: "in" | "out", imported = false): LedgerEntry =>
 ({ date, rowKey, amountCents, direction, imported });

test("months run from the first entry to the last with no gaps", () => {
 // An empty month is information — a shop wants to see the quiet one.
 assert.deepEqual(monthSpan([e("2026-01-05", "revenue", 1, "in"), e("2026-04-02", "revenue", 1, "in")]),
  ["2026-01", "2026-02", "2026-03", "2026-04"]);
});

test("a span crossing a year end keeps counting", () => {
 assert.deepEqual(monthSpan([e("2025-11-01", "revenue", 1, "in"), e("2026-02-01", "revenue", 1, "in")]),
  ["2025-11", "2025-12", "2026-01", "2026-02"]);
});

test("no entries, no months", () => {
 assert.deepEqual(monthSpan([]), []);
});

test("a stray far-future date can't spin up thousands of columns", () => {
 const span = monthSpan([e("2026-01-01", "revenue", 1, "in"), e("2999-01-01", "revenue", 1, "in")]);
 assert.ok(span.length <= 600);
});

test("months are labelled the way a spreadsheet header reads", () => {
 assert.equal(monthLabel("2026-03"), "Mar 26");
});

test("costs are negative and revenue positive, so the column adds up on its own", () => {
 const g = buildGrid([
  e("2026-01-05", "revenue", 12_000, "in"),
  e("2026-01-06", "cogs", 4_000, "out"),
 ], ROWS);
 assert.deepEqual(g.rows.find((r) => r.key === "revenue")!.cells, [12_000]);
 assert.deepEqual(g.rows.find((r) => r.key === "cogs")!.cells, [-4_000]);
 assert.deepEqual(g.rows.find((r) => r.key === "net")!.cells, [8_000]);
});

test("a line with nothing in it still shows — two months can't be compared otherwise", () => {
 const g = buildGrid([e("2026-01-05", "revenue", 100, "in")], ROWS);
 assert.ok(g.rows.some((r) => r.key === "expenses"));
 assert.deepEqual(g.rows.find((r) => r.key === "expenses")!.cells, [0]);
});

test("net is summed from the rows above, so the total can never disagree with them", () => {
 const g = buildGrid([
  e("2026-01-05", "revenue", 10_000, "in"),
  e("2026-01-05", "cogs", 3_000, "out"),
  e("2026-02-05", "revenue", 5_000, "in"),
  e("2026-02-05", "expenses", 1_000, "out"),
 ], ROWS);
 const net = g.rows.find((r) => r.key === "net")!;
 assert.deepEqual(net.cells, [7_000, 4_000]);
 assert.equal(net.total, 11_000);
 // and each month's column adds up to it
 g.months.forEach((_m, i) => {
  const colSum = g.rows.filter((r) => r.key !== "net").reduce((s, r) => s + r.cells[i], 0);
  assert.equal(colSum, net.cells[i]);
 });
});

test("row totals are the sum of their own months", () => {
 const g = buildGrid([e("2026-01-05", "revenue", 100, "in"), e("2026-03-05", "revenue", 200, "in")], ROWS);
 assert.equal(g.rows.find((r) => r.key === "revenue")!.total, 300);
});

test("a month holding both her sheet and VYA's own records is flagged", () => {
 // Silently adding both would double-count her March. She has to be told.
 const g = buildGrid([
  e("2026-01-05", "revenue", 100, "in", true),
  e("2026-02-05", "revenue", 100, "in", true),
  e("2026-02-06", "revenue", 100, "in", false),
 ], ROWS);
 assert.deepEqual(g.overlapMonths, ["2026-02"]);
});

test("no overlap when the import stops before VYA starts", () => {
 const g = buildGrid([
  e("2026-01-05", "revenue", 100, "in", true),
  e("2026-02-06", "revenue", 100, "in", false),
 ], ROWS);
 assert.deepEqual(g.overlapMonths, []);
});

test("an entry for a row we don't render is ignored, not crashed on", () => {
 const g = buildGrid([e("2026-01-05", "mystery", 100, "in")], ROWS);
 assert.deepEqual(g.rows.find((r) => r.key === "net")!.cells, [0]);
});

test("the CSV opens in the spreadsheet she came from", () => {
 const g = buildGrid([e("2026-01-05", "revenue", 12_000, "in"), e("2026-01-06", "cogs", 4_000, "out")], ROWS);
 const csv = gridToCsv(g).split("\n");
 assert.equal(csv[0], ",Jan 26,Total");
 assert.equal(csv[1], "Revenue,120.00,120.00");
 assert.equal(csv[2], "Cost of goods,-40.00,-40.00");
 assert.equal(csv[csv.length - 1], "Net profit,80.00,80.00");
});

test("a label with a comma survives the CSV", () => {
 const g = buildGrid([e("2026-01-05", "revenue", 1, "in")], [{ key: "revenue", label: "Revenue, gross", direction: "in" }]);
 assert.match(gridToCsv(g), /"Revenue, gross"/);
});
