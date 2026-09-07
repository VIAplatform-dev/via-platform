import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanEmailList, notifyRecipients } from "./settings-core.ts";

test("booking alerts can go to several people", () => {
 // A shop is rarely one person: the owner wants these and so does whoever is behind the counter.
 assert.equal(cleanEmailList("a@shop.com, b@shop.com"), "a@shop.com, b@shop.com");
 assert.deepEqual(notifyRecipients("a@shop.com, b@shop.com"), ["a@shop.com", "b@shop.com"]);
});

test("a typo is dropped rather than stored and silently ignored later", () => {
 // An address that never receives anything costs a shop its booking alerts, unnoticed for a month.
 assert.equal(cleanEmailList("a@shop.com, not-an-email, b@shop.com"), "a@shop.com, b@shop.com");
 assert.equal(cleanEmailList("nonsense"), null);
 assert.equal(cleanEmailList(""), null);
});

test("the same address twice is once, and five is the ceiling", () => {
 assert.equal(cleanEmailList("A@shop.com, a@shop.com"), "a@shop.com");
 const many = Array.from({ length: 8 }, (_, i) => `p${i}@shop.com`).join(", ");
 assert.equal(notifyRecipients(cleanEmailList(many)).length, 5);
});
