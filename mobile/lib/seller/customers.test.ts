import { test } from "node:test";
import assert from "node:assert/strict";
import { allTags, filterByTag, withTag, withoutTag } from "./customers.ts";

const people = [
  { email: "a@x.com", tags: ["VIP", "market"] },
  { email: "b@x.com", tags: ["market"] },
  { email: "c@x.com", tags: [] },
  { email: "d@x.com", tags: null },
];

test("the filter row lists every tag once, most used first, as the server stores it", () => {
  assert.deepEqual(allTags(people), ["market", "vip"]);
});

test("a chip narrows to the people carrying that tag, whatever case it was typed in", () => {
  assert.deepEqual(filterByTag(people, "market").map((c) => c.email), ["a@x.com", "b@x.com"]);
  assert.deepEqual(filterByTag(people, "VIP").map((c) => c.email), ["a@x.com"]);
  assert.equal(filterByTag(people, null).length, 4);
});

test("adding and removing a tag gives the whole set the PATCH replaces", () => {
  assert.deepEqual(withTag(["vip"], " Market "), ["vip", "market"]);
  assert.deepEqual(withTag(["vip"], "VIP"), ["vip"]);
  assert.deepEqual(withTag(null, ""), []);
  assert.deepEqual(withoutTag(["vip", "market"], "Market"), ["vip"]);
  assert.deepEqual(withoutTag(undefined, "x"), []);
});
