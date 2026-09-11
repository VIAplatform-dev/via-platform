import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCode, discountValueFromText, describeDiscount } from "./discounts.ts";

test("a code is uppercased and stripped to what a buyer can type", () => {
  assert.equal(normalizeCode("spring 20"), "SPRING20");
  assert.equal(normalizeCode("  SPRING20 "), "SPRING20");
  assert.equal(normalizeCode("summer-sale_2"), "SUMMER-SALE_2");
  assert.equal(normalizeCode("20% off!"), "20OFF");
});

test("an empty code stays empty, so the Create button can stay disabled", () => {
  assert.equal(normalizeCode(""), "");
  assert.equal(normalizeCode("   "), "");
  assert.equal(normalizeCode(null), "");
});

test("a percentage is whole and never over 100", () => {
  assert.equal(discountValueFromText("20", "percent"), 20);
  assert.equal(discountValueFromText("20.6", "percent"), 21);
  assert.equal(discountValueFromText("110", "percent"), 100);
});

test("a fixed amount keeps its pennies", () => {
  assert.equal(discountValueFromText("12.50", "fixed"), 12.5);
});

test("an empty amount is null, not zero", () => {
  // Zero off is a real (pointless) code; blank is "I haven't said yet".
  assert.equal(discountValueFromText("", "percent"), null);
  assert.equal(discountValueFromText(null, "fixed"), null);
});

test("the line under a code prefers her own name for it", () => {
  assert.equal(describeDiscount({ label: "Friends", kind: "percent", value: 20, used: 3 }), "Friends · 3 used");
  assert.equal(describeDiscount({ kind: "percent", value: 20, used: 0 }), "20% off · 0 used");
});

test("no usage count at all is different from a count of zero", () => {
  assert.equal(describeDiscount({ kind: "percent", value: 20 }), "20% off");
});
