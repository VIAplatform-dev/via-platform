import { test } from "node:test";
import assert from "node:assert/strict";
import { CONDITION_GRADES, CONDITION_DEFINITIONS, normalizeCondition, conditionDefinition, isConditionGrade } from "./condition-core.ts";

test("the scale is fixed, best first, and every grade has a one-line definition", () => {
 assert.deepEqual(CONDITION_GRADES, ["Mint", "Excellent", "Very good", "Good", "Fair"]);
 for (const g of CONDITION_GRADES) assert.ok(CONDITION_DEFINITIONS[g].length > 10, g);
 assert.equal(conditionDefinition("Good"), CONDITION_DEFINITIONS.Good);
});

test("a grade typed in any case is itself", () => {
 assert.equal(normalizeCondition("mint"), "Mint");
 assert.equal(normalizeCondition("VERY GOOD"), "Very good");
 assert.equal(normalizeCondition(" Fair "), "Fair");
});

test("the intake model's own grades map onto the scale", () => {
 // ai-intake.ts returns conditionGrade from Deadstock/NWT · Excellent · Very Good · Good · Fair.
 assert.equal(normalizeCondition("Deadstock/NWT"), "Mint");
 assert.equal(normalizeCondition("Very Good"), "Very good");
 assert.equal(normalizeCondition("Excellent"), "Excellent");
});

test("free text a seller already saved lands on the nearest grade, or nowhere", () => {
 assert.equal(normalizeCondition("Excellent — light wear to the sole"), "Excellent");
 assert.equal(normalizeCondition("NWT, never worn"), "Mint");
 assert.equal(normalizeCondition("like new"), "Excellent");
 assert.equal(normalizeCondition("gently worn"), "Good");
 assert.equal(normalizeCondition("some wear, as-is"), "Fair");
 assert.equal(normalizeCondition("very good vintage condition"), "Very good");
 assert.equal(normalizeCondition("lovely"), null);
 assert.equal(normalizeCondition(""), null);
 assert.equal(normalizeCondition(null), null);
});

test("isConditionGrade is exact — only a stored grade gets the definition line", () => {
 assert.equal(isConditionGrade("Very good"), true);
 assert.equal(isConditionGrade("very good"), false);
 assert.equal(isConditionGrade("Excellent — light wear"), false);
});
