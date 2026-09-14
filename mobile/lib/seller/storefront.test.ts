import { test } from "node:test";
import assert from "node:assert/strict";
import { storefrontAddress, describeReach, describeServeMode, shopLine } from "./storefront.ts";

const sf = { publicOrigin: "https://blummier.vyasites.com", settings: { handle: "blummier", enabled: true } };

test("the address is the one the server computed", () => {
  assert.deepEqual(storefrontAddress(sf), { url: "https://blummier.vyasites.com", host: "blummier.vyasites.com" });
  // Plan B unconfigured: the server says there is no public origin, and the app must not invent one.
  assert.equal(storefrontAddress({ publicOrigin: null, settings: { handle: "blummier" } }), null);
  assert.equal(storefrontAddress(null), null);
  assert.equal(storefrontAddress(undefined), null);
});

test("a verified custom domain replaces it; an unverified one does not", () => {
  const verified = { configured: true, domain: "blummier.com", status: { domain: "blummier.com", verified: true, misconfigured: false } };
  assert.equal(storefrontAddress(sf, verified)?.host, "blummier.com");
  // Connected, but the DNS record isn't in place — shoppers cannot reach it, so it is not her address.
  const pending = { configured: true, domain: "blummier.com", status: { verified: false, misconfigured: false } };
  assert.equal(storefrontAddress(sf, pending)?.host, "blummier.vyasites.com");
  // Verified but pointed elsewhere is the same thing: not reachable here.
  const broken = { configured: true, domain: "blummier.com", status: { verified: true, misconfigured: true } };
  assert.equal(storefrontAddress(sf, broken)?.host, "blummier.vyasites.com");
  // A verified domain is still an address when Plan B gives no origin of its own.
  assert.equal(storefrontAddress({ publicOrigin: null }, verified)?.host, "blummier.com");
});

test("a scheme, a trailing slash or capitals are not part of the host", () => {
  const d = { configured: true, domain: "https://Blummier.com/", status: { verified: true, misconfigured: false } };
  assert.equal(storefrontAddress(sf, d)?.host, "blummier.com");
  assert.equal(storefrontAddress({ publicOrigin: "HTTPS://Blummier.VYASites.com/" })?.host, "blummier.vyasites.com");
});

test("what the address said is what she is told", () => {
  assert.equal(describeReach(200).good, true);
  assert.match(describeReach(200).line, /^Live/);
  // The case that used to be a 404 page inside her app.
  const off = describeReach(404);
  assert.equal(off.good, false);
  assert.match(off.line, /isn't switched on/);
  assert.equal(describeReach(0).good, false);
  assert.match(describeReach(0).line, /the connection/);
  assert.equal(describeReach(undefined).line, "Checking…");
  assert.match(describeReach(503).line, /error/);
  assert.match(describeReach(403).line, /answered 403/);
});

test("a connected-but-unverified domain is said out loud on a shop that is otherwise live", () => {
  const pending = { configured: true, domain: "blummier.com", status: { verified: false } };
  const r = describeReach(200, pending);
  assert.equal(r.good, true);
  assert.match(r.line, /isn't verified yet/);
  const verified = { configured: true, domain: "blummier.com", status: { verified: true, misconfigured: false } };
  assert.match(describeReach(200, verified).line, /your own domain/i);
});

test("the shop in one line", () => {
  assert.equal(shopLine(12, 48), "12 pieces · 48 follows");
  assert.equal(shopLine(1, 1), "1 piece · 1 follow");
  assert.equal(shopLine(0, 0), "0 pieces");
  assert.equal(shopLine(3, null), "3 pieces");
  assert.equal(shopLine(3, undefined), "3 pieces");
});

test("which storefront she is looking at", () => {
  assert.equal(describeServeMode({ settings: { serveMode: "imported" } }), "Your imported site");
  assert.equal(describeServeMode({ settings: { serveMode: "built" } }), "The storefront you built");
  // Predates storefront versions — the server isn't saying, so neither do we.
  assert.equal(describeServeMode({ settings: { serveMode: null } }), null);
  assert.equal(describeServeMode({ settings: {} }), null);
  assert.equal(describeServeMode(null), null);
});
