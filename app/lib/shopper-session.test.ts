import { test } from "node:test";
import assert from "node:assert/strict";
import { signShopperToken, readShopperToken, SHOPPER_COOKIE, shopperCookieOptions } from "./shopper-session.ts";

const SECRET = "test-secret-not-a-real-one";

test("a shopper signed in on a store is recognised on that store", () => {
 const t = signShopperToken({ email: "buyer@example.com", storeSlug: "sourcedbyscottie" }, SECRET);
 const got = readShopperToken(t, "sourcedbyscottie", SECRET);
 assert.equal(got?.email, "buyer@example.com");
});

test("a token from ONE store is worthless on another", () => {
 // The whole privacy boundary. Signing in at Scottie's must not sign you in at Blummier's, even if
 // the cookie somehow reaches it.
 const t = signShopperToken({ email: "buyer@example.com", storeSlug: "sourcedbyscottie" }, SECRET);
 assert.equal(readShopperToken(t, "blummier", SECRET), null);
});

test("a tampered token is rejected", () => {
 // The payload is encoded, so forging means rewriting it and keeping the old signature — which is
 // exactly what someone would try.
 const t = signShopperToken({ email: "buyer@example.com", storeSlug: "blummier" }, SECRET);
 const [payload, sig] = t.split(".");
 const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
 body.email = "someone@else.com";
 const forged = `${Buffer.from(JSON.stringify(body), "utf8").toString("base64url")}.${sig}`;
 assert.equal(readShopperToken(forged, "blummier", SECRET), null, "a rewritten payload must not pass");

 // And moving it to another store, which is the boundary that matters most.
 body.email = "buyer@example.com";
 body.storeSlug = "sourcedbyscottie";
 const moved = `${Buffer.from(JSON.stringify(body), "utf8").toString("base64url")}.${sig}`;
 assert.equal(readShopperToken(moved, "sourcedbyscottie", SECRET), null);

 assert.equal(readShopperToken(t.slice(0, -4), "blummier", SECRET), null, "a truncated signature must not pass");
});

test("a token signed with a different secret is rejected", () => {
 const t = signShopperToken({ email: "buyer@example.com", storeSlug: "blummier" }, SECRET);
 assert.equal(readShopperToken(t, "blummier", "some-other-secret"), null);
});

test("an expired session is not a session", () => {
 const old = signShopperToken({ email: "buyer@example.com", storeSlug: "blummier" }, SECRET, { issuedAt: Date.now() - 91 * 24 * 3600 * 1000 });
 assert.equal(readShopperToken(old, "blummier", SECRET), null);
});

test("rubbish is rejected without throwing", () => {
 for (const junk of ["", "abc", "a.b.c", "...", "eyJ9.x"]) {
  assert.equal(readShopperToken(junk, "blummier", SECRET), null, junk);
 }
});

test("the email is stored the way we look it up — lower case, trimmed", () => {
 const t = signShopperToken({ email: "  Buyer@Example.COM ", storeSlug: "blummier" }, SECRET);
 assert.equal(readShopperToken(t, "blummier", SECRET)?.email, "buyer@example.com");
});

// ── the guardrail ────────────────────────────────────────────────────────────────────────────────
// A cookie is only shared with subdomains if something says so. Nothing in this codebase sets a
// cookie domain, which is why signing in on scottie.getvya.ai does not sign you into getvya.ai. If
// anyone ever adds one, every store would start recognising marketplace members and every seller's
// customers would silently become VYA's — with no error and nothing failing. This test is the alarm.

test("the shopper cookie is never shared across subdomains", () => {
 const opts = shopperCookieOptions();
 assert.equal((opts as Record<string, unknown>).domain, undefined, "a domain here merges every store's shoppers with the marketplace's");
 assert.equal(opts.httpOnly, true);
 assert.equal(opts.sameSite, "lax");
 assert.equal(opts.path, "/");
});

test("the cookie is named distinctly from the marketplace's own session", () => {
 assert.notEqual(SHOPPER_COOKIE, "authjs.session-token");
 assert.match(SHOPPER_COOKIE, /store/i);
});
