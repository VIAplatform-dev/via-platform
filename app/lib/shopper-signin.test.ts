import { test } from "node:test";
import assert from "node:assert/strict";
import { signInLinkToken, readSignInLink } from "./shopper-signin.ts";

const SECRET = "test-secret-not-a-real-one";
const now = Date.now();

test("a link signs the right person into the right store", () => {
 const t = signInLinkToken({ email: "buyer@example.com", storeSlug: "blummier" }, SECRET);
 const got = readSignInLink(t, "blummier", SECRET);
 assert.equal(got?.email, "buyer@example.com");
});

test("a link for one store cannot sign anyone into another", () => {
 // Someone forwarding their sign-in email must not hand over an account at every store.
 const t = signInLinkToken({ email: "buyer@example.com", storeSlug: "blummier" }, SECRET);
 assert.equal(readSignInLink(t, "sourcedbyscottie", SECRET), null);
});

test("a link expires quickly — it travels through email", () => {
 const stale = signInLinkToken({ email: "buyer@example.com", storeSlug: "blummier" }, SECRET, { issuedAt: now - 31 * 60 * 1000 });
 assert.equal(readSignInLink(stale, "blummier", SECRET), null, "half an hour is long enough");
 const fresh = signInLinkToken({ email: "buyer@example.com", storeSlug: "blummier" }, SECRET, { issuedAt: now - 5 * 60 * 1000 });
 assert.ok(readSignInLink(fresh, "blummier", SECRET));
});

test("a sign-in link is not a session", async () => {
 // The two must not be interchangeable: a link lives in an inbox for ever and a session lasts 90
 // days. Signing them the same way would turn a forwarded email into a permanent account.
 const link = signInLinkToken({ email: "buyer@example.com", storeSlug: "blummier" }, SECRET);
 const { readShopperToken } = await import("./shopper-session.ts");
 assert.equal(readShopperToken(link, "blummier", SECRET), null, "a link must not be accepted as a session cookie");
});

test("a rewritten link is refused", () => {
 const t = signInLinkToken({ email: "buyer@example.com", storeSlug: "blummier" }, SECRET);
 const [payload, sig] = t.split(".");
 const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
 body.email = "attacker@example.com";
 const forged = `${Buffer.from(JSON.stringify(body), "utf8").toString("base64url")}.${sig}`;
 assert.equal(readSignInLink(forged, "blummier", SECRET), null);
});

test("rubbish is refused without throwing", () => {
 for (const junk of ["", "x", "a.b", "..", "eyJ9."]) assert.equal(readSignInLink(junk, "blummier", SECRET), null, junk);
});

test("the email is normalised the way it is stored", () => {
 const t = signInLinkToken({ email: " Buyer@Example.COM ", storeSlug: "blummier" }, SECRET);
 assert.equal(readSignInLink(t, "blummier", SECRET)?.email, "buyer@example.com");
});
