import { test } from "node:test";
import assert from "node:assert/strict";
import { payoutMethodOptions, splitPctFromText, describeConsignor, ALL_PAYOUT_METHODS, toggleMethod, PAYOUT_METHOD_LABELS } from "./consignors.ts";

test("a store with no methods configured still offers store credit", () => {
  assert.deepEqual(payoutMethodOptions(null), [{ key: "store_credit", label: "Store credit" }]);
  assert.deepEqual(payoutMethodOptions([]), [{ key: "store_credit", label: "Store credit" }]);
});

test("a method the phone doesn't know is shown, not dropped", () => {
  // Hiding it would make a consignor who IS paid that way look unpaid.
  assert.deepEqual(payoutMethodOptions(["cash", "bank_draft"]), [
    { key: "cash", label: "Cash" },
    { key: "bank_draft", label: "bank draft" },
  ]);
});

test("blank means the store default, and 0% means zero", () => {
  assert.equal(splitPctFromText(""), null);
  assert.equal(splitPctFromText(null), null);
  assert.equal(splitPctFromText("0"), 0);
});

test("a typo is clamped rather than sent", () => {
  assert.equal(splitPctFromText("500"), 100);
  assert.equal(splitPctFromText("60"), 60);
});

test("the line under a name says the cut and how they're paid", () => {
  assert.equal(describeConsignor({ defaultSplitPct: 60, payoutMethod: "cash", status: "active" }), "60% · Cash");
  assert.equal(describeConsignor({ defaultSplitPct: null, payoutMethod: null }), "No cut set");
});

test("a status is only mentioned when it isn't the ordinary one", () => {
  assert.equal(describeConsignor({ defaultSplitPct: 50, status: "active" }), "50%");
  assert.equal(describeConsignor({ defaultSplitPct: 50, status: "paused" }), "50% · paused");
});

// ── Which ways a store offers to pay ─────────────────────────────────────────

test("all four methods the web offers are offered here", () => {
  assert.deepEqual(ALL_PAYOUT_METHODS.map((m) => m.key), ["stripe", "store_credit", "cash", "check"]);
  for (const m of ALL_PAYOUT_METHODS) {
    assert.ok(m.label.trim() && m.hint.trim(), m.key);
    assert.ok(PAYOUT_METHOD_LABELS[m.key], `${m.key} has no label`);
  }
});

test("a store can never be left with no way to pay a consignor", () => {
  // Switching off the last one would leave someone owed money and nothing to settle it with.
  assert.deepEqual(toggleMethod(["store_credit"], "store_credit"), ["store_credit"]);
  assert.deepEqual(toggleMethod([], "store_credit"), ["store_credit"]);
  assert.deepEqual(toggleMethod(null, "store_credit"), ["store_credit"]);
});

test("turning one on keeps the canonical order, so the chips don't shuffle", () => {
  assert.deepEqual(toggleMethod(["store_credit"], "cash"), ["store_credit", "cash"]);
  assert.deepEqual(toggleMethod(["cash"], "stripe"), ["stripe", "cash"]);
  assert.deepEqual(toggleMethod(["check", "store_credit"], "cash"), ["store_credit", "cash", "check"]);
});

test("turning one off removes exactly it", () => {
  assert.deepEqual(toggleMethod(["stripe", "cash"], "cash"), ["stripe"]);
  assert.deepEqual(toggleMethod(["stripe", "store_credit", "cash"], "store_credit"), ["stripe", "cash"]);
});
