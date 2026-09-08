import { test } from "node:test";
import assert from "node:assert/strict";
import { itemSearchText, itemStatusWord } from "./search-core.ts";

const base = { sku: 12, title: "Fendi baguette", brand: "Fendi", category: "handbags", size: null, status: "active" };

test("where it came from, its flaws and the condition note are all searchable", () => {
 const text = itemSearchText({ ...base, sourceName: "Kempton", flaws: ["scuffed toe", "light pilling"], conditionNote: "One loose button" });
 for (const q of ["kempton", "scuffed toe", "pilling", "loose button", "sku-1012", "fendi", "handbags"]) assert.ok(text.includes(q), q);
});

test("a missing or malformed flaws list never breaks the haystack", () => {
 assert.ok(itemSearchText({ ...base, flaws: null }).includes("fendi"));
 assert.ok(itemSearchText({ ...base, flaws: "not a list" }).includes("fendi"));
 assert.ok(itemSearchText({ ...base, flaws: [1, "real flaw"] }).includes("real flaw"));
});

test("a held piece says on hold; a buyer's reservation says reserved; everything else is its status", () => {
 assert.equal(itemStatusWord("reserved", true), "on hold");
 assert.equal(itemStatusWord("reserved", false), "reserved");
 assert.equal(itemStatusWord("active", true), "active");
 assert.equal(itemStatusWord("sold", false), "sold");
});
