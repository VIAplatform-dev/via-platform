import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";

// The pure half of eBay sale notifications: what eBay checks us against, how a delivery is read,
// and which store it belongs to. No network, no database — see ebay-notify-db.ts for the IO and
// ebay-notify-receive.ts for the request handling.
//
// WHICH MECHANISM. eBay's Commerce Notification API (the modern, signed webhook) gained a seller
// topic ORDER_CONFIRMATION in release 1.6.6 (2025-12-01): "sent to a seller when the buyer
// completes checkout and payment clears". It needs the seller's user token with sell.fulfillment
// — the same scope getOrders (our poll) needs. The legacy Trading API "platform notifications"
// (ItemSold / FixedPriceTransaction over SOAP) still exist, but need eBay to whitelist the app for
// OAuth use and are on the retirement path. So: subscribe through the Notification API; parse and
// verify a Trading-style SOAP delivery too, so an endpoint that is ever registered there still works.

// ── Endpoint verification (eBay calls GET ?challenge_code=… when a destination is created) ────

/** sha256(challengeCode + verificationToken + endpoint) as hex — the order is eBay's, not ours. */
export function challengeResponse(challengeCode: string, verificationToken: string, endpoint: string): string {
 return createHash("sha256").update(challengeCode + verificationToken + endpoint).digest("hex");
}

/** eBay's constraint on a destination's verification token: 32–80 chars of [A-Za-z0-9_-]. */
export function validVerificationToken(token: string | undefined | null): boolean {
 return typeof token === "string" && /^[A-Za-z0-9_-]{32,80}$/.test(token);
}

// ── Notification API signature ──────────────────────────────────────────────────────────────────
// Header `x-ebay-signature` = base64(JSON { kid, signature, alg, digest }). The key id names a
// public key fetched from GET /commerce/notification/v1/public_key/{kid} (app token), returned as
// bare base64 SPKI DER with `algorithm` ("ECDSA") and `digest` ("SHA1"). The signature covers the
// body bytes.

export type SignatureHeader = { kid: string; signature: string; alg?: string; digest?: string };

export function decodeSignatureHeader(header: string | null | undefined): SignatureHeader | null {
 if (!header) return null;
 try {
  const j = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  if (!j || typeof j.kid !== "string" || !j.kid || typeof j.signature !== "string" || !j.signature) return null;
  return { kid: j.kid, signature: j.signature, alg: typeof j.alg === "string" ? j.alg : undefined, digest: typeof j.digest === "string" ? j.digest : undefined };
 } catch {
  return null;
 }
}

/** Accepts the key as eBay returns it (bare base64 DER) or as PEM. */
function pemFromKey(key: string): string {
 const k = key.trim();
 if (k.includes("-----BEGIN")) return k;
 return `-----BEGIN PUBLIC KEY-----\n${k}\n-----END PUBLIC KEY-----`;
}

function digestName(digest: string | undefined): string {
 const d = (digest || "SHA1").toUpperCase().replace(/[^A-Z0-9]/g, "");
 if (d === "SHA256") return "sha256";
 if (d === "SHA384") return "sha384";
 if (d === "SHA512") return "sha512";
 return "sha1";
}

/** True only when the signature verifies. Any malformed input is false, never a throw. */
export function verifyNotificationSignature(o: { body: string; signature: string; publicKey: string; digest?: string }): boolean {
 try {
  const key = createPublicKey({ key: pemFromKey(o.publicKey), format: "pem" });
  const sig = Buffer.from(o.signature, "base64");
  if (!sig.length) return false;
  return cryptoVerify(digestName(o.digest), Buffer.from(o.body), key, sig);
 } catch {
  return false;
 }
}

// ── Trading API platform-notification signature (legacy) ────────────────────────────────────────

/** base64(md5(Timestamp + DevId + AppId + CertId)) — the SOAP header's NotificationSignature. */
export function tradingSignature(timestamp: string, devId: string, appId: string, certId: string): string {
 return createHash("md5").update(timestamp + devId + appId + certId).digest("base64");
}

// ── Reading a delivery ──────────────────────────────────────────────────────────────────────────

export type ParsedNotification = {
 kind: "notification-api" | "trading";
 /** eBay's notificationId (or a derived key for SOAP) — the dedupe key. */
 id: string;
 topic: string;
 ebayUserIds: string[];
 itemIds: string[];
 skus: string[];
 orderId: string | null;
 /** Top-level keys of notification.data — kept (values are not) so the first real delivery shows its shape. */
 dataKeys: string[];
 trading?: { signature: string | null; timestamp: string | null };
};

const SALE_TOPICS = new Set(["ORDER_CONFIRMATION", "FixedPriceTransaction", "ItemSold", "AuctionCheckoutComplete"]);
export function isSaleTopic(topic: string): boolean {
 return SALE_TOPICS.has(topic);
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : null);
function push(into: string[], v: unknown) {
 const s = str(v);
 if (s && !into.includes(s)) into.push(s);
}

function parseJson(body: string): ParsedNotification | null {
 let j: unknown;
 try { j = JSON.parse(body); } catch { return null; }
 if (!j || typeof j !== "object") return null;
 const root = j as Record<string, unknown>;
 const meta = (root.metadata && typeof root.metadata === "object" ? root.metadata : {}) as Record<string, unknown>;
 const n = root.notification && typeof root.notification === "object" ? (root.notification as Record<string, unknown>) : null;
 if (!n) return null;
 const id = str(n.notificationId);
 const topic = str(meta.topic);
 if (!id || !topic) return null;
 const data = (n.data && typeof n.data === "object" ? n.data : {}) as Record<string, unknown>;

 const users: string[] = [];
 push(users, data.sellerId); push(users, data.sellerUsername); push(users, data.username); push(users, data.userId); push(users, data.recipientUserId);
 const seller = data.seller && typeof data.seller === "object" ? (data.seller as Record<string, unknown>) : null;
 if (seller) { push(users, seller.username); push(users, seller.userId); push(users, seller.sellerId); }

 const items: string[] = [];
 const skus: string[] = [];
 const readItem = (o: Record<string, unknown>) => {
  push(items, o.itemId); push(items, o.listingId); push(items, o.legacyItemId);
  push(skus, o.sku);
 };
 readItem(data);
 for (const key of ["lineItems", "items"]) {
  const arr = data[key];
  if (Array.isArray(arr)) for (const li of arr) if (li && typeof li === "object") readItem(li as Record<string, unknown>);
 }

 return {
  kind: "notification-api", id, topic, ebayUserIds: users, itemIds: items, skus,
  orderId: str(data.orderId) ?? str(data.legacyOrderId),
  dataKeys: Object.keys(data),
 };
}

// A handful of tags read with a regex: eBay's SOAP is flat where it matters, and an XML parser
// dependency for four fields is not worth its weight. Namespace prefixes are ignored.
function tag(xml: string, name: string): string | null {
 const m = xml.match(new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([^<]*)<\\/(?:[\\w-]+:)?${name}>`));
 return m ? str(m[1]) : null;
}
function tags(xml: string, name: string): string[] {
 const out: string[] = [];
 const re = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([^<]*)<\\/(?:[\\w-]+:)?${name}>`, "g");
 for (const m of xml.matchAll(re)) push(out, m[1]);
 return out;
}

function parseSoap(body: string): ParsedNotification | null {
 if (!/<(?:[\w-]+:)?Envelope[\s>]/.test(body)) return null;
 const topic = tag(body, "NotificationEventName");
 if (!topic) return null;
 const timestamp = tag(body, "Timestamp");
 const items = tags(body, "ItemID");
 const users: string[] = [];
 const sellerBlock = body.match(/<(?:[\w-]+:)?Seller[\s>][\s\S]*?<\/(?:[\w-]+:)?Seller>/);
 if (sellerBlock) push(users, tag(sellerBlock[0], "UserID"));
 push(users, tag(body, "RecipientUserID"));
 const id = `trading:${topic}:${items[0] ?? tag(body, "CorrelationID") ?? "-"}:${timestamp ?? "-"}`;
 return {
  kind: "trading", id, topic, ebayUserIds: users, itemIds: items, skus: tags(body, "SKU"),
  orderId: tag(body, "OrderID") ?? tag(body, "TransactionID"),
  dataKeys: [],
  trading: { signature: tag(body, "NotificationSignature"), timestamp },
 };
}

/** Either shape → one record. Null for anything unreadable (the caller acks and logs). */
export function parseNotification(body: string): ParsedNotification | null {
 const t = (body || "").trim();
 if (!t) return null;
 if (t.startsWith("{")) return parseJson(t);
 if (t.startsWith("<")) return parseSoap(t);
 return null;
}

export function dedupeKey(p: ParsedNotification): string {
 return p.id;
}

// ── Which store ─────────────────────────────────────────────────────────────────────────────────

export type StoreChoice = { slugs: string[]; how: "matched" | "broadcast" | "none" };

/**
 * `matched` are the stores the IO layer found by sku, listing id or eBay user. A match wins. With
 * no match, a SALE on a small fleet syncs every connected store — exactly what the hourly cron
 * does, brought forward to now — because the ORDER_CONFIRMATION data shape is not fully
 * published and a sale must still arrive in seconds on day one. Above the cap it is logged only.
 */
export function chooseStores(o: { matched: string[]; connected: string[]; saleTopic: boolean; broadcastCap?: number }): StoreChoice {
 if (!o.saleTopic) return { slugs: [], how: "none" };
 const matched = Array.from(new Set(o.matched.filter(Boolean)));
 if (matched.length) return { slugs: matched, how: "matched" };
 const cap = o.broadcastCap ?? 10;
 if (o.connected.length && o.connected.length <= cap) return { slugs: [...o.connected], how: "broadcast" };
 return { slugs: [], how: "none" };
}

/** The window the sync pulls: two hours back. eBay retries a failed delivery a few times over minutes, not hours. */
export function syncWindowSince(nowMs: number): string {
 return new Date(nowMs - 2 * 3600 * 1000).toISOString();
}

// ── The admin's one line ────────────────────────────────────────────────────────────────────────

function ago(ms: number): string {
 if (ms < 60_000) return "just now";
 const m = Math.floor(ms / 60_000);
 if (m < 60) return `${m}m ago`;
 const h = Math.floor(m / 60);
 if (h < 24) return `${h}h ago`;
 return `${Math.floor(h / 24)}d ago`;
}

function shortDate(iso: string): string {
 const d = new Date(iso);
 return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function describeNotifyState(o: { since: string | null; lastReceivedAt: string | null; now: number }): string {
 if (!o.since) return "off — run setup";
 const last = o.lastReceivedAt ? `last received ${ago(o.now - Date.parse(o.lastReceivedAt))}` : "nothing received yet";
 return `on since ${shortDate(o.since)} · ${last}`;
}
