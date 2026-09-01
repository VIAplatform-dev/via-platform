import { test } from "node:test";
import assert from "node:assert/strict";
import { authorityFor, COUNTRY_AUTHORITIES, US_STATE_AUTHORITIES, US_FALLBACK, EU_OSS } from "./tax-authorities.ts";

test("the countries these stores are in all have an answer", () => {
 for (const c of ["GB", "AU", "CA", "IE", "NZ"]) {
  const a = authorityFor(c);
  assert.equal(a?.kind, "authority", `${c} should have an authority`);
 }
});

test("a US state gives that state's own authority", () => {
 const a = authorityFor("US", "NY");
 assert.equal(a?.kind, "authority");
 if (a?.kind === "authority") assert.match(a.authority.url, /tax\.ny\.gov/);
});

test("a US state we don't list falls back rather than inventing a link", () => {
 // A wrong government URL is worse than a general one, because she'll trust it.
 const a = authorityFor("US", "WY");
 assert.equal(a?.kind, "authority");
 if (a?.kind === "authority") assert.equal(a.authority.url, US_FALLBACK.url);
});

test("a state with no sales tax gets an answer, not a link", () => {
 const a = authorityFor("US", "OR");
 assert.equal(a?.kind, "none");
 if (a?.kind === "none") assert.match(a.message, /no sales tax/i);
});

test("US without a state has no answer to give", () => {
 // Sales tax is per state; a country-level US link would be wrong.
 assert.equal(authorityFor("US"), null);
 assert.equal(authorityFor("US", ""), null);
});

test("an EU country without its own entry gets the One Stop Shop", () => {
 // Registering in 27 countries is the mistake; OSS is one registration for the bloc.
 const a = authorityFor("PT");
 assert.equal(a?.kind, "authority");
 if (a?.kind === "authority") assert.equal(a.authority.url, EU_OSS.url);
});

test("a country we know nothing about returns null rather than a guess", () => {
 assert.equal(authorityFor("ZZ"), null);
 assert.equal(authorityFor(""), null);
 assert.equal(authorityFor(null), null);
});

test("every link is https and every entry names its authority", () => {
 const all = [...Object.values(COUNTRY_AUTHORITIES), ...Object.values(US_STATE_AUTHORITIES), US_FALLBACK, EU_OSS];
 for (const a of all) {
  assert.match(a.url, /^https:\/\//, `${a.authority} needs an https url`);
  assert.ok(a.authority.length > 2, "an authority needs a name");
  assert.ok(a.what.length > 2, "a registration needs a description");
 }
});
