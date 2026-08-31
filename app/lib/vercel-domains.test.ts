import { test } from "node:test";
import assert from "node:assert/strict";
import { isApexDomain } from "./vercel-domains.ts";

// Getting this wrong hands a seller the wrong DNS record: an apex needs an A
// record at "@", a subdomain needs a CNAME. A UK store told to add a CNAME named
// "vintagestores" points its whole site at nothing.

test("plain apex domains", () => {
 for (const d of ["vintagestores.com", "vintage.shop", "example.co"]) {
  assert.equal(isApexDomain(d), true, d);
 }
});

test("subdomains are not apex", () => {
 for (const d of ["shop.vintagestores.com", "www.vintagestores.com", "a.b.example.com"]) {
  assert.equal(isApexDomain(d), false, d);
 }
});

test("two-part suffixes are apex despite the extra dot", () => {
 for (const d of ["vintagestores.co.uk", "shop.com.au", "store.co.nz", "brand.com.br", "label.co.za"]) {
  assert.equal(isApexDomain(d), true, d);
 }
});

test("a subdomain under a two-part suffix is still not apex", () => {
 assert.equal(isApexDomain("shop.vintagestores.co.uk"), false);
});

test("case and a trailing dot don't change the answer", () => {
 assert.equal(isApexDomain("VintageStores.CO.UK"), true);
 assert.equal(isApexDomain("vintagestores.com."), true);
});
