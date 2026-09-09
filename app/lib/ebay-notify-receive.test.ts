import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { handleChallenge, handleDelivery, type ReceiveDeps } from "./ebay-notify-receive.ts";
import { tradingSignature } from "./ebay-notify-core.ts";

// The receiving end, with eBay, the database and the sync all faked. What is proved: the challenge
// is answered, a genuine delivery syncs the right store within two hours of now, a forged one is
// refused before it touches anything, and every way a delivery can be odd (unknown store, replay,
// malformed, wrong topic, slow sync) ends in a 2xx that eBay will not retry into a dead endpoint.

const NOW = Date.parse("2026-09-07T12:00:00.000Z");
const ENDPOINT = "https://vyaplatform.com/api/webhooks/ebay";
const TOKEN = "t".repeat(40);

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const KEY = publicKey.export({ type: "spki", format: "der" }).toString("base64");
function signed(body: string, kid = "kid-1") {
 const signature = sign("sha1", Buffer.from(body), privateKey).toString("base64");
 return Buffer.from(JSON.stringify({ kid, signature, alg: "ecdsa", digest: "SHA1" })).toString("base64");
}

function order(o: { id?: string; sku?: string; itemId?: string; seller?: string; topic?: string } = {}) {
 return JSON.stringify({
  metadata: { topic: o.topic ?? "ORDER_CONFIRMATION", schemaVersion: "1.0" },
  notification: {
   notificationId: o.id ?? "n-1", publishDate: "2026-09-07T11:59:58.000Z",
   data: { orderId: "12-1", seller: { username: o.seller ?? "scottie_vintage" }, lineItems: [{ legacyItemId: o.itemId ?? "335000000001", sku: o.sku ?? "item_abc" }] },
  },
 });
}

type Rec = { id: string; topic: string; storeSlug: string | null; outcome: string; detail: string | null };
function fakes(o: {
 connected?: string[]; bySku?: Record<string, string>; byListing?: Record<string, string>; byUser?: Record<string, string>;
 seen?: string[]; sync?: ReceiveDeps["sync"]; syncTimeoutMs?: number; publicKey?: ReceiveDeps["publicKey"]; tradingCreds?: ReceiveDeps["tradingCreds"];
 verificationToken?: string | null;
} = {}) {
 const records: Rec[] = [];
 const synced: { slug: string; since: string }[] = [];
 const seen = new Set(o.seen ?? []);
 const logs: string[] = [];
 const deps: ReceiveDeps = {
  now: () => NOW,
  endpoint: ENDPOINT,
  verificationToken: o.verificationToken === undefined ? TOKEN : o.verificationToken,
  publicKey: o.publicKey ?? (async (kid) => (kid === "kid-1" ? { key: KEY, digest: "SHA1" } : null)),
  tradingCreds: o.tradingCreds ?? (() => ({ devId: "dev", appId: "app", certId: "cert" })),
  storesBySku: async (skus) => skus.map((s) => o.bySku?.[s]).filter((x): x is string => !!x),
  storesByListingId: async (ids) => ids.map((s) => o.byListing?.[s]).filter((x): x is string => !!x),
  storesByEbayUser: async (users) => users.map((s) => o.byUser?.[s]).filter((x): x is string => !!x),
  connectedStores: async () => o.connected ?? ["scottie"],
  record: async (r) => { if (seen.has(r.id)) return { inserted: false }; seen.add(r.id); records.push({ ...r }); return { inserted: true }; },
  updateOutcome: async (id, outcome, detail, storeSlug) => { const r = records.find((x) => x.id === id); if (r) { r.outcome = outcome; r.detail = detail; if (storeSlug !== undefined) r.storeSlug = storeSlug; } },
  sync: o.sync ?? (async (slug, since) => { synced.push({ slug, since }); return { checked: 1, pulled: ["item_abc"] }; }),
  syncTimeoutMs: o.syncTimeoutMs,
  log: (m) => logs.push(m),
 };
 return { deps, records, synced, logs };
}

// ── GET: the verification challenge ────────────────────────────────────────────────────────────

test("the challenge is answered with the hash eBay expects, as JSON", async () => {
 const { deps } = fakes();
 const r = await handleChallenge("abc", deps);
 assert.equal(r.status, 200);
 assert.deepEqual(r.body, { challengeResponse: createHash("sha256").update("abc" + TOKEN + ENDPOINT).digest("hex") });
});

test("no challenge code is a 400; no verification token configured is a 500 that says so", async () => {
 assert.equal((await handleChallenge(null, fakes().deps)).status, 400);
 const r = await handleChallenge("abc", fakes({ verificationToken: null }).deps);
 assert.equal(r.status, 500);
 assert.match(String(r.body.error), /EBAY_NOTIFY_VERIFICATION_TOKEN/);
});

// ── POST: a genuine sale ────────────────────────────────────────────────────────────────────────

test("a signed ORDER_CONFIRMATION for a known sku syncs that store from two hours ago, and records it", async () => {
 const f = fakes({ bySku: { item_abc: "scottie" }, connected: ["scottie", "tess"] });
 const body = order();
 const r = await handleDelivery({ body, signatureHeader: signed(body) }, f.deps);
 assert.equal(r.status, 200);
 assert.deepEqual(f.synced, [{ slug: "scottie", since: "2026-09-07T10:00:00.000Z" }]);
 assert.equal(f.records.length, 1);
 assert.equal(f.records[0].storeSlug, "scottie");
 assert.equal(f.records[0].outcome, "synced");
 assert.match(String(f.records[0].detail), /pulled 1/);
});

test("the store is found by listing id or by eBay user when the sku is not ours", async () => {
 const byListing = fakes({ byListing: { "335000000001": "tess" }, connected: ["scottie", "tess"] });
 let body = order({ sku: "not-ours" });
 await handleDelivery({ body, signatureHeader: signed(body) }, byListing.deps);
 assert.deepEqual(byListing.synced.map((s) => s.slug), ["tess"]);

 const byUser = fakes({ byUser: { scottie_vintage: "scottie" }, connected: ["scottie", "tess"] });
 body = order({ sku: "not-ours", itemId: "999" });
 await handleDelivery({ body, signatureHeader: signed(body) }, byUser.deps);
 assert.deepEqual(byUser.synced.map((s) => s.slug), ["scottie"]);
});

test("a forged signature is a 401 and touches nothing — not the log, not the sync", async () => {
 const f = fakes({ bySku: { item_abc: "scottie" } });
 const body = order();
 const forged = signed(body.replace("12-1", "12-2")); // signature of a different body
 const r = await handleDelivery({ body, signatureHeader: forged }, f.deps);
 assert.equal(r.status, 401);
 assert.equal(f.records.length, 0);
 assert.equal(f.synced.length, 0);
});

test("a JSON body with no signature header, or an unknown key id, is a 401", async () => {
 const f = fakes();
 const body = order();
 assert.equal((await handleDelivery({ body, signatureHeader: null }, f.deps)).status, 401);
 assert.equal((await handleDelivery({ body, signatureHeader: signed(body, "kid-unknown") }, f.deps)).status, 401);
 assert.equal(f.records.length, 0);
});

test("an unknown store on a big fleet is a 202, logged as unknown-store with the payload's keys", async () => {
 const f = fakes({ connected: Array.from({ length: 12 }, (_, i) => `s${i}`) });
 const body = order({ sku: "zzz", itemId: "1", seller: "nobody" });
 const r = await handleDelivery({ body, signatureHeader: signed(body) }, f.deps);
 assert.equal(r.status, 202);
 assert.equal(f.synced.length, 0);
 assert.equal(f.records[0].outcome, "unknown-store");
 assert.match(String(f.records[0].detail), /orderId, seller, lineItems/);
});

test("an unknown store on a small fleet syncs every connected store — the hourly cron, now", async () => {
 const f = fakes({ connected: ["scottie", "tess"] });
 const body = order({ sku: "zzz", itemId: "1", seller: "nobody" });
 const r = await handleDelivery({ body, signatureHeader: signed(body) }, f.deps);
 assert.equal(r.status, 200);
 assert.deepEqual(f.synced.map((s) => s.slug), ["scottie", "tess"]);
 assert.equal(f.records[0].outcome, "synced");
 assert.equal(f.records[0].storeSlug, "scottie, tess");
 assert.match(String(f.records[0].detail), /broadcast/);
});

test("a replay of the same notification id is a 200 no-op: recorded once, synced once", async () => {
 const f = fakes({ bySku: { item_abc: "scottie" } });
 const body = order({ id: "same" });
 await handleDelivery({ body, signatureHeader: signed(body) }, f.deps);
 const r = await handleDelivery({ body, signatureHeader: signed(body) }, f.deps);
 assert.equal(r.status, 200);
 assert.equal(r.body.replay, true);
 assert.equal(f.synced.length, 1);
 assert.equal(f.records.length, 1);
});

test("a signed but malformed body is a 202 and logged, so eBay stops retrying and the admin can see it", async () => {
 const f = fakes();
 const body = JSON.stringify({ hello: "world" });
 const r = await handleDelivery({ body, signatureHeader: signed(body) }, f.deps);
 assert.equal(r.status, 202);
 assert.equal(f.records.length, 1);
 assert.equal(f.records[0].outcome, "malformed");
 assert.equal(f.synced.length, 0);
});

test("a signed notice on another topic is acknowledged and ignored — never a sync", async () => {
 const f = fakes({ byUser: { scottie_vintage: "scottie" } });
 const body = order({ topic: "FEEDBACK_RECEIVED" });
 const r = await handleDelivery({ body, signatureHeader: signed(body) }, f.deps);
 assert.equal(r.status, 200);
 assert.equal(f.synced.length, 0);
 assert.equal(f.records[0].outcome, "ignored");
});

test("a sync that hangs is capped: eBay still gets a 2xx, the record says timeout, the cron catches up", async () => {
 const f = fakes({ bySku: { item_abc: "scottie" }, sync: () => new Promise(() => {}), syncTimeoutMs: 20 });
 const body = order();
 const r = await handleDelivery({ body, signatureHeader: signed(body) }, f.deps);
 assert.equal(r.status, 200);
 assert.equal(f.records[0].outcome, "timeout");
});

test("a sync that throws is a 2xx with the error recorded — a bug in the sync must not disable the endpoint", async () => {
 const f = fakes({ bySku: { item_abc: "scottie" }, sync: async () => { throw new Error("boom"); } });
 const body = order();
 const r = await handleDelivery({ body, signatureHeader: signed(body) }, f.deps);
 assert.equal(r.status, 200);
 assert.equal(f.records[0].outcome, "sync-error");
 assert.match(String(f.records[0].detail), /boom/);
});

// ── POST: the legacy Trading shape ─────────────────────────────────────────────────────────────

function soap(o: { ts?: string; sig?: string; item?: string; sku?: string; event?: string } = {}) {
 const ts = o.ts ?? "2026-09-07T11:58:00.000Z";
 const sig = o.sig ?? tradingSignature(ts, "dev", "app", "cert");
 return `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ebl="urn:ebay:apis:eBLBaseComponents">
<soapenv:Header><ebl:RequesterCredentials><ebl:NotificationSignature>${sig}</ebl:NotificationSignature></ebl:RequesterCredentials></soapenv:Header>
<soapenv:Body><GetItemTransactionsResponse xmlns="urn:ebay:apis:eBLBaseComponents"><Timestamp>${ts}</Timestamp><NotificationEventName>${o.event ?? "FixedPriceTransaction"}</NotificationEventName>
<RecipientUserID>scottie_vintage</RecipientUserID><Item><ItemID>${o.item ?? "335000000001"}</ItemID><SKU>${o.sku ?? "item_abc"}</SKU></Item></GetItemTransactionsResponse></soapenv:Body></soapenv:Envelope>`;
}

test("a Trading FixedPriceTransaction with a valid MD5 signature syncs the store", async () => {
 const f = fakes({ bySku: { item_abc: "scottie" } });
 const r = await handleDelivery({ body: soap(), signatureHeader: null }, f.deps);
 assert.equal(r.status, 200);
 assert.deepEqual(f.synced.map((s) => s.slug), ["scottie"]);
 assert.equal(f.records[0].topic, "FixedPriceTransaction");
});

test("a Trading delivery with a wrong signature, a stale timestamp, or no credentials configured is a 401", async () => {
 const f = fakes({ bySku: { item_abc: "scottie" } });
 assert.equal((await handleDelivery({ body: soap({ sig: "bad" }), signatureHeader: null }, f.deps)).status, 401);
 assert.equal((await handleDelivery({ body: soap({ ts: "2026-09-07T11:00:00.000Z" }), signatureHeader: null }, f.deps)).status, 401, "older than ten minutes");
 const none = fakes({ tradingCreds: () => null });
 assert.equal((await handleDelivery({ body: soap(), signatureHeader: null }, none.deps)).status, 401);
 assert.equal(f.records.length, 0);
});

test("a Trading retry (same item, same timestamp) is a no-op", async () => {
 const f = fakes({ bySku: { item_abc: "scottie" } });
 await handleDelivery({ body: soap(), signatureHeader: null }, f.deps);
 const r = await handleDelivery({ body: soap(), signatureHeader: null }, f.deps);
 assert.equal(r.body.replay, true);
 assert.equal(f.synced.length, 1);
});
