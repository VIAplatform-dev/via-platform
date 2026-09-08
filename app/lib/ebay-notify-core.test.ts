import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
 challengeResponse, chooseStores, decodeSignatureHeader, dedupeKey, describeNotifyState, isSaleTopic,
 parseNotification, syncWindowSince, tradingSignature, validVerificationToken, verifyNotificationSignature,
} from "./ebay-notify-core.ts";

// The pure half of "a sale on eBay reaches VYA in seconds". Nothing here talks to eBay or the
// database; what is pinned down is the arithmetic eBay checks us against (the challenge hash, the
// two signature schemes), how a payload of either shape is read, and which store a delivery is for.

// ── Endpoint verification ───────────────────────────────────────────────────────────────────────

test("the challenge answer is sha256(challengeCode + verificationToken + endpoint) as hex, in that order", () => {
 const code = "abc123", token = "v".repeat(32), endpoint = "https://vyaplatform.com/api/webhooks/ebay";
 const expected = createHash("sha256").update(code + token + endpoint).digest("hex");
 assert.equal(challengeResponse(code, token, endpoint), expected);
 // Order matters — eBay rejects any other concatenation.
 assert.notEqual(challengeResponse(code, token, endpoint), createHash("sha256").update(token + code + endpoint).digest("hex"));
});

test("a verification token is 32–80 characters of [A-Za-z0-9_-], nothing else", () => {
 assert.equal(validVerificationToken("a".repeat(32)), true);
 assert.equal(validVerificationToken("a".repeat(80)), true);
 assert.equal(validVerificationToken("a".repeat(31)), false);
 assert.equal(validVerificationToken("a".repeat(81)), false);
 assert.equal(validVerificationToken("a".repeat(31) + "!"), false);
 assert.equal(validVerificationToken("ok-token_" + "x".repeat(30)), true);
 assert.equal(validVerificationToken(undefined), false);
});

// ── Notification API signature (ECDSA over the body) ───────────────────────────────────────────

function signedDelivery(body: string, digest = "SHA1") {
 const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
 const signature = sign(digest.toLowerCase(), Buffer.from(body), privateKey).toString("base64");
 // eBay's getPublicKey returns the SPKI DER as bare base64 — no PEM armour.
 const key = publicKey.export({ type: "spki", format: "der" }).toString("base64");
 const header = Buffer.from(JSON.stringify({ kid: "kid-1", signature, alg: "ecdsa", digest })).toString("base64");
 return { header, key };
}

test("the signature header is base64 JSON carrying the key id and the signature", () => {
 const { header } = signedDelivery("{}");
 const d = decodeSignatureHeader(header);
 assert.equal(d?.kid, "kid-1");
 assert.equal(typeof d?.signature, "string");
 assert.equal(decodeSignatureHeader("not base64 json"), null);
 assert.equal(decodeSignatureHeader(""), null);
 assert.equal(decodeSignatureHeader(Buffer.from(JSON.stringify({ signature: "x" })).toString("base64")), null, "no kid → unusable");
});

test("a genuine delivery verifies against eBay's bare-base64 public key; a tampered body does not", () => {
 const body = JSON.stringify({ metadata: { topic: "ORDER_CONFIRMATION" }, notification: { notificationId: "n1", data: { orderId: "o1" } } });
 const { header, key } = signedDelivery(body);
 const sig = decodeSignatureHeader(header)!;
 assert.equal(verifyNotificationSignature({ body, signature: sig.signature, publicKey: key, digest: "SHA1" }), true);
 assert.equal(verifyNotificationSignature({ body: body.replace("o1", "o2"), signature: sig.signature, publicKey: key, digest: "SHA1" }), false);
 assert.equal(verifyNotificationSignature({ body, signature: "AAAA", publicKey: key, digest: "SHA1" }), false, "garbage signature is false, not a throw");
 assert.equal(verifyNotificationSignature({ body, signature: sig.signature, publicKey: "not a key", digest: "SHA1" }), false, "garbage key is false, not a throw");
});

test("the digest eBay names on the key is honoured (SHA256 keys verify with sha256)", () => {
 const body = "{\"a\":1}";
 const { header, key } = signedDelivery(body, "SHA256");
 const sig = decodeSignatureHeader(header)!;
 assert.equal(verifyNotificationSignature({ body, signature: sig.signature, publicKey: key, digest: "SHA256" }), true);
 assert.equal(verifyNotificationSignature({ body, signature: sig.signature, publicKey: key, digest: "SHA1" }), false);
});

// ── Trading API platform-notification signature (legacy fallback) ─────────────────────────────

test("the Trading signature is base64(md5(Timestamp + DevId + AppId + CertId))", () => {
 const ts = "2026-09-07T10:00:00.000Z";
 const expected = createHash("md5").update(ts + "dev" + "app" + "cert").digest("base64");
 assert.equal(tradingSignature(ts, "dev", "app", "cert"), expected);
});

// ── Reading a payload of either shape ─────────────────────────────────────────────────────────

const ORDER = {
 metadata: { topic: "ORDER_CONFIRMATION", schemaVersion: "1.0", deprecated: false },
 notification: {
  notificationId: "8ac2e3a6-1",
  eventDate: "2026-09-07T10:00:00.000Z",
  publishDate: "2026-09-07T10:00:01.000Z",
  publishAttemptCount: 1,
  data: {
   orderId: "12-34567-89012",
   seller: { username: "scottie_vintage" },
   lineItems: [{ legacyItemId: "335012345678", sku: "item_abc", title: "Blumarine slip dress" }],
  },
 },
};

test("a Notification API payload yields its id, topic, the seller, and every item id and sku", () => {
 const p = parseNotification(JSON.stringify(ORDER));
 assert.ok(p);
 assert.equal(p.kind, "notification-api");
 assert.equal(p.id, "8ac2e3a6-1");
 assert.equal(p.topic, "ORDER_CONFIRMATION");
 assert.deepEqual(p.ebayUserIds, ["scottie_vintage"]);
 assert.deepEqual(p.itemIds, ["335012345678"]);
 assert.deepEqual(p.skus, ["item_abc"]);
 assert.equal(p.orderId, "12-34567-89012");
 // The shape of ORDER_CONFIRMATION's data is not published in full: the keys are kept (never the
 // values) so the first real delivery shows the admin what eBay actually sends.
 assert.deepEqual(p.dataKeys, ["orderId", "seller", "lineItems"]);
});

test("the seller is found under whichever key eBay uses, without inventing one", () => {
 const withKey = (data: Record<string, unknown>) => parseNotification(JSON.stringify({ metadata: { topic: "ORDER_CONFIRMATION" }, notification: { notificationId: "n", data } }))!.ebayUserIds;
 assert.deepEqual(withKey({ sellerId: "a" }), ["a"]);
 assert.deepEqual(withKey({ username: "b" }), ["b"]);
 assert.deepEqual(withKey({ sellerUsername: "c" }), ["c"]);
 assert.deepEqual(withKey({ seller: { userId: "d" } }), ["d"]);
 assert.deepEqual(withKey({ buyer: { username: "not-the-seller" } }), []);
});

test("item ids and skus are read from the top level or from line items, deduped", () => {
 const p = parseNotification(JSON.stringify({ metadata: { topic: "ORDER_CONFIRMATION" }, notification: { notificationId: "n", data: {
  itemId: "1", listingId: "1", legacyItemId: "2", sku: "s1",
  lineItems: [{ itemId: "3", sku: "s1" }, { legacyItemId: "3" }, { listingId: "4" }],
 } } }))!;
 assert.deepEqual(p.itemIds, ["1", "2", "3", "4"]);
 assert.deepEqual(p.skus, ["s1"]);
});

const SOAP = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ebl="urn:ebay:apis:eBLBaseComponents">
 <soapenv:Header>
  <ebl:RequesterCredentials soapenv:mustUnderstand="0">
   <ebl:NotificationSignature>c2lnbmF0dXJl</ebl:NotificationSignature>
  </ebl:RequesterCredentials>
 </soapenv:Header>
 <soapenv:Body>
  <GetItemTransactionsResponse xmlns="urn:ebay:apis:eBLBaseComponents">
   <Timestamp>2026-09-07T10:00:00.000Z</Timestamp>
   <Ack>Success</Ack>
   <CorrelationID>abc-corr-1</CorrelationID>
   <NotificationEventName>FixedPriceTransaction</NotificationEventName>
   <RecipientUserID>scottie_vintage</RecipientUserID>
   <Item><ItemID>335012345678</ItemID><SKU>item_abc</SKU><Seller><UserID>scottie_vintage</UserID></Seller></Item>
   <TransactionArray><Transaction><TransactionID>555</TransactionID></Transaction></TransactionArray>
  </GetItemTransactionsResponse>
 </soapenv:Body>
</soapenv:Envelope>`;

test("a Trading platform notification (SOAP) yields the same shape, with its signature and timestamp", () => {
 const p = parseNotification(SOAP);
 assert.ok(p);
 assert.equal(p.kind, "trading");
 assert.equal(p.topic, "FixedPriceTransaction");
 assert.equal(p.trading?.signature, "c2lnbmF0dXJl");
 assert.equal(p.trading?.timestamp, "2026-09-07T10:00:00.000Z");
 assert.deepEqual(p.ebayUserIds, ["scottie_vintage"]);
 assert.deepEqual(p.itemIds, ["335012345678"]);
 assert.deepEqual(p.skus, ["item_abc"]);
 assert.equal(p.id, "trading:FixedPriceTransaction:335012345678:2026-09-07T10:00:00.000Z");
});

test("a malformed body is null, never a throw", () => {
 assert.equal(parseNotification("not json, not xml"), null);
 assert.equal(parseNotification(""), null);
 assert.equal(parseNotification("{}"), null, "JSON with no notification block");
 assert.equal(parseNotification(JSON.stringify({ metadata: { topic: "X" }, notification: {} })), null, "no id → cannot dedupe → malformed");
 assert.equal(parseNotification("<Envelope><Body></Body></Envelope>"), null, "SOAP with no event");
});

test("only order topics are sales; a feedback or deletion notice never triggers a sync", () => {
 assert.equal(isSaleTopic("ORDER_CONFIRMATION"), true);
 assert.equal(isSaleTopic("FixedPriceTransaction"), true);
 assert.equal(isSaleTopic("ItemSold"), true);
 assert.equal(isSaleTopic("AuctionCheckoutComplete"), true);
 assert.equal(isSaleTopic("MARKETPLACE_ACCOUNT_DELETION"), false);
 assert.equal(isSaleTopic("FEEDBACK_RECEIVED"), false);
 assert.equal(isSaleTopic("EndOfAuction"), false);
});

test("the dedupe key is the notification id, so eBay's retry of the same delivery is the same key", () => {
 const p = parseNotification(JSON.stringify(ORDER))!;
 assert.equal(dedupeKey(p), "8ac2e3a6-1");
 const again = parseNotification(JSON.stringify({ ...ORDER, notification: { ...ORDER.notification, publishAttemptCount: 2 } }))!;
 assert.equal(dedupeKey(again), dedupeKey(p));
});

// ── Which store ─────────────────────────────────────────────────────────────────────────────────

test("a store matched by sku, listing id or eBay user wins outright", () => {
 assert.deepEqual(chooseStores({ matched: ["scottie"], connected: ["scottie", "tess"], saleTopic: true }), { slugs: ["scottie"], how: "matched" });
 assert.deepEqual(chooseStores({ matched: ["scottie", "scottie"], connected: ["scottie"], saleTopic: true }), { slugs: ["scottie"], how: "matched" });
});

test("an unmatched sale on a small fleet syncs every connected store — what the cron does hourly, done now", () => {
 // The payload shape is not fully published; until the first real delivery pins it down, a sale
 // must still arrive in seconds. A few getOrders calls is the price, the same the cron pays.
 assert.deepEqual(chooseStores({ matched: [], connected: ["a", "b", "c"], saleTopic: true }), { slugs: ["a", "b", "c"], how: "broadcast" });
});

test("an unmatched sale on a large fleet is logged, not broadcast", () => {
 const connected = Array.from({ length: 11 }, (_, i) => `s${i}`);
 assert.deepEqual(chooseStores({ matched: [], connected, saleTopic: true }), { slugs: [], how: "none" });
 assert.deepEqual(chooseStores({ matched: [], connected, saleTopic: true, broadcastCap: 20 }), { slugs: connected, how: "broadcast" });
});

test("a non-sale topic never syncs anyone, matched or not", () => {
 assert.deepEqual(chooseStores({ matched: ["scottie"], connected: ["scottie"], saleTopic: false }), { slugs: [], how: "none" });
 assert.deepEqual(chooseStores({ matched: [], connected: ["a"], saleTopic: false }), { slugs: [], how: "none" });
});

test("the sync looks back two hours from now — wide enough to cover eBay's retries, narrow enough to be cheap", () => {
 const now = Date.parse("2026-09-07T12:00:00.000Z");
 assert.equal(syncWindowSince(now), "2026-09-07T10:00:00.000Z");
});

// ── The one line the admin reads ────────────────────────────────────────────────────────────────

test("the state line says on-since and how long ago the last delivery was, or that setup is needed", () => {
 const now = Date.parse("2026-09-07T12:00:00.000Z");
 assert.equal(describeNotifyState({ since: null, lastReceivedAt: null, now }), "off — run setup");
 assert.equal(describeNotifyState({ since: "2026-09-01T09:00:00.000Z", lastReceivedAt: null, now }), "on since 1 Sep 2026 · nothing received yet");
 assert.equal(describeNotifyState({ since: "2026-09-01T09:00:00.000Z", lastReceivedAt: "2026-09-07T11:57:00.000Z", now }), "on since 1 Sep 2026 · last received 3m ago");
 assert.equal(describeNotifyState({ since: "2026-09-01T09:00:00.000Z", lastReceivedAt: "2026-09-07T11:59:50.000Z", now }), "on since 1 Sep 2026 · last received just now");
 assert.equal(describeNotifyState({ since: "2026-09-01T09:00:00.000Z", lastReceivedAt: "2026-09-07T09:00:00.000Z", now }), "on since 1 Sep 2026 · last received 3h ago");
 assert.equal(describeNotifyState({ since: "2026-09-01T09:00:00.000Z", lastReceivedAt: "2026-09-04T09:00:00.000Z", now }), "on since 1 Sep 2026 · last received 3d ago");
});
