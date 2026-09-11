import { test } from "node:test";
import assert from "node:assert/strict";
import { searchTermFrom, missingRegistrantFields, describeMissing, priceLine, EMPTY_REGISTRANT } from "./domains.ts";

test("whatever she types becomes a bare label to search", () => {
  assert.equal(searchTermFrom("My Brand"), "mybrand");
  assert.equal(searchTermFrom("mybrand.com"), "mybrand");
  assert.equal(searchTermFrom("https://www.mybrand.com/shop"), "mybrand");
  assert.equal(searchTermFrom("  MYBRAND  "), "mybrand");
});

test("a label can't start or end with a dash, which registrars refuse", () => {
  assert.equal(searchTermFrom("-brand-"), "brand");
  assert.equal(searchTermFrom("my brand!"), "mybrand");
});

test("nothing typed searches for nothing", () => {
  assert.equal(searchTermFrom(""), "");
  assert.equal(searchTermFrom(null), "");
  assert.equal(searchTermFrom("!!!"), "");
});

test("every registrant field is required — a blank one fails the whole purchase", () => {
  assert.equal(missingRegistrantFields(EMPTY_REGISTRANT).length, 8, "country is prefilled US");
  const full = { ...EMPTY_REGISTRANT, firstName: "A", lastName: "B", email: "a@b.c", phone: "1", address1: "x", city: "y", state: "z", zip: "1" };
  assert.deepEqual(missingRegistrantFields(full), []);
});

test("what's missing is named, so a failed charge never explains it instead", () => {
  const r = { ...EMPTY_REGISTRANT, lastName: "B", email: "a@b.c", phone: "1", address1: "x", city: "y", state: "z" };
  assert.equal(describeMissing(r), "Add your first name and postcode.");
  const one = { ...r, zip: "1" };
  assert.equal(describeMissing(one), "Add your first name.");
  assert.equal(describeMissing({ ...one, firstName: "A" }), null);
});

test("a price always carries its unit — a domain is billed yearly", () => {
  assert.equal(priceLine({ domain: "a.com", tld: "com", available: true, priceCents: 1200 }), "$12/year");
  assert.equal(priceLine({ domain: "a.com", tld: "com", available: true, priceCents: 1200 }, "GBP"), "£12/year");
});

test("a taken domain says so instead of showing a price it can't sell", () => {
  assert.equal(priceLine({ domain: "a.com", tld: "com", available: false, priceCents: 1200 }), "Taken");
  assert.equal(priceLine({ domain: "a.com", tld: "com", available: true, priceCents: null }), "Price unavailable");
});
