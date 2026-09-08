import { test } from "node:test";
import assert from "node:assert/strict";
import { platformsToCheck } from "./market-sync-core.ts";

// Which marketplaces a checkout must ask "did this already sell?" before charging.

test("a piece listed live on eBay needs an eBay check", () => {
 assert.deepEqual(platformsToCheck([{ itemId: "a", platform: "ebay", status: "listed", externalUrl: null }]), ["ebay"]);
});

test("a piece that is only on VYA needs no check at all", () => {
 // The common case, and it must cost nothing: no marketplace calls, no delay at checkout.
 assert.deepEqual(platformsToCheck([]), []);
});

test("queued, failed and pulled listings are not live anywhere, so nothing to check", () => {
 assert.deepEqual(platformsToCheck([
  { itemId: "a", platform: "ebay", status: "queued", externalUrl: null },
  { itemId: "a", platform: "depop", status: "failed", externalUrl: null },
  { itemId: "a", platform: "ebay", status: "removed", externalUrl: null },
 ]), []);
});

test("only marketplaces with a sale feed are checked — a paste-only channel can't be asked", () => {
 // Poshmark and the rest have no API; we could not learn about a sale there even if we tried.
 assert.deepEqual(platformsToCheck([
  { itemId: "a", platform: "poshmark", status: "listed", externalUrl: null },
  { itemId: "a", platform: "depop", status: "listed", externalUrl: null },
 ]), ["depop"]);
});

test("each platform once, across a whole bag", () => {
 assert.deepEqual(platformsToCheck([
  { itemId: "a", platform: "ebay", status: "listed", externalUrl: null },
  { itemId: "b", platform: "ebay", status: "listed", externalUrl: null },
  { itemId: "b", platform: "depop", status: "listed", externalUrl: null },
 ]), ["ebay", "depop"]);
});
