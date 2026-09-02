import { test } from "node:test";
import assert from "node:assert/strict";
import {
 normalizeQrCode,
 qrTargetUrl,
 destinationFor,
 isAllowedDestination,
 FALLBACK_DESTINATION,
 isLikelyBotScan,
} from "./qr-codes.ts";

test("the QR encodes a short getvya.ai URL", () => {
 assert.equal(qrTargetUrl("fendi-ny"), "https://getvya.ai/q/fendi-ny");
});

test("a scan is tagged so utm_visits sees it alongside every other source", () => {
 assert.equal(
  destinationFor("https://getvya.ai/", "getvya"),
  "https://getvya.ai/?utm_source=qr&utm_medium=print&utm_campaign=getvya"
 );
});

test("a code can point at the marketplace, not only the OS host", () => {
 // The Fendi code is the whole reason the single-origin rule became an allowlist.
 assert.equal(
  destinationFor("https://vyaplatform.com/brands/fendi/newyork", "fendi-ny"),
  "https://vyaplatform.com/brands/fendi/newyork?utm_source=qr&utm_medium=print&utm_campaign=fendi-ny"
 );
});

test("both hosts are allowed, with or without www", () => {
 for (const u of [
  "https://getvya.ai/",
  "https://www.getvya.ai/company",
  "https://vyaplatform.com/brands/fendi/newyork",
  "https://www.vyaplatform.com/",
 ]) assert.equal(isAllowedDestination(u), true, u);
});

test("a destination we do not own is refused", () => {
 // A printed card cannot be recalled. If a bad row ever reaches the qr_codes table — a typo,
 // a paste, a compromised write — it must not be able to send our own QR off our domains.
 // "getvya.ai.evil.com" is the one that catches a naive suffix check.
 for (const u of [
  "https://evil.com/steal",
  "https://getvya.ai.evil.com/",
  "https://notgetvya.ai/",
  "javascript:alert(1)",
  "//evil.com",
  "not a url at all",
  "",
 ]) assert.equal(isAllowedDestination(u), false, u);
});

test("plain http is refused even on our own host", () => {
 // Scans happen on phones on event wifi. A downgraded hop is not worth allowing.
 assert.equal(isAllowedDestination("http://getvya.ai/"), false);
});

test("a refused or missing destination still lands somewhere real", () => {
 // Never dead-end: an unknown code, an inactive row, or a database that is down all send
 // the person to the homepage rather than to an error page.
 for (const bad of ["https://evil.com/steal", "", null, undefined]) {
  assert.equal(
   destinationFor(bad, "fendi-ny"),
   `${FALLBACK_DESTINATION}?utm_source=qr&utm_medium=print&utm_campaign=fendi-ny`
  );
 }
});

test("a destination's own query survives the utm tagging", () => {
 const url = new URL(destinationFor("https://vyaplatform.com/brands/fendi?sort=new", "fendi-ny"));
 assert.equal(url.searchParams.get("sort"), "new");
 assert.equal(url.searchParams.get("utm_campaign"), "fendi-ny");
});

test("codes normalise: case, whitespace, and junk", () => {
 assert.equal(normalizeQrCode(" Fendi-NY "), "fendi-ny");
 assert.equal(normalizeQrCode("../../evil.com"), "evilcom");
 assert.equal(normalizeQrCode("%%%"), "");
 assert.equal(normalizeQrCode("x".repeat(200)).length, 40);
});

test("junk in the code never reaches the redirect URL", () => {
 assert.equal(
  destinationFor("https://getvya.ai/", "../../evil.com"),
  "https://getvya.ai/?utm_source=qr&utm_medium=print&utm_campaign=evilcom"
 );
 assert.equal(
  destinationFor("https://getvya.ai/", "%%%"),
  "https://getvya.ai/?utm_source=qr&utm_medium=print&utm_campaign=unknown"
 );
});

test("link previewers and crawlers are not counted as scans", () => {
 for (const ua of [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "facebookexternalhit/1.1",
  "Slackbot-LinkExpanding 1.0",
  "WhatsApp/2.23",
  "Twitterbot/1.0",
  "curl/8.4.0",
 ]) assert.equal(isLikelyBotScan(ua), true, ua);
});

test("a real phone camera scan is counted", () => {
 for (const ua of [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
 ]) assert.equal(isLikelyBotScan(ua), false, ua);
 assert.equal(isLikelyBotScan(null), false);
});
