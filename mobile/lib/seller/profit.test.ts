import { test } from "node:test";
import assert from "node:assert/strict";
import { profitRows, netProfitLine, noProfitPrompt } from "./profit.ts";

const margin = {
  netProfitCents: -12_000,
  profit: {
    lines: [
      { label: "Revenue", cents: 84_000 },
      { label: "Cost of goods", cents: -60_000 },
      { label: "Card processing", cents: -2_700, estimate: true },
      { label: "Shipping labels", cents: -33_300 },
      { label: "Net profit", cents: -12_000, total: true },
    ],
    missingCostNote: "Cost missing on 2 sold pieces — not counted above.",
  },
};

test("the statement reads in the server's order, in her currency, with a minus where money went out", () => {
  const rows = profitRows(margin, "GBP");
  assert.deepEqual(rows.map((r) => [r.label, r.amount, r.negative, r.total]), [
    ["Revenue", "£840", false, false],
    ["Cost of goods", "-£600", true, false],
    ["Card processing (est.)", "-£27", true, false],
    ["Shipping labels", "-£333", true, false],
    ["Net profit", "-£120", true, true],
  ]);
});

test("a negative net profit is a number, never hidden or clamped", () => {
  assert.equal(netProfitLine(margin, "GBP"), "-£120");
  assert.equal(netProfitLine({ netProfitCents: 34_000 }, "USD"), "$340");
});

test("with no cost on record there are no rows and no net line — only the prompt, with the caveat", () => {
  const unknown = { netProfitCents: null, profit: { lines: [], missingCostNote: "Cost missing on 3 sold pieces — not counted above." } };
  assert.deepEqual(profitRows(unknown, "GBP"), []);
  assert.equal(netProfitLine(unknown, "GBP"), null);
  assert.match(noProfitPrompt(unknown), /No cost on record/);
  assert.match(noProfitPrompt(unknown), /3 sold pieces/);
  assert.match(noProfitPrompt(null), /Add what you paid/);
  assert.deepEqual(profitRows(undefined, "GBP"), []);
});
