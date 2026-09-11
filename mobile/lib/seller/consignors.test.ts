import { test } from "node:test";
import assert from "node:assert/strict";
import { payoutMethodOptions, splitPctFromText, describeConsignor } from "./consignors.ts";

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
