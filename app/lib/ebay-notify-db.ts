/* eslint-disable @typescript-eslint/no-explicit-any */
import { neon } from "@neondatabase/serverless";
import { BASE_URL } from "./base-url.ts";
import { describeNotifyState, validVerificationToken } from "./ebay-notify-core.ts";
import type { ReceiveDeps } from "./ebay-notify-receive.ts";
import { NOTIFY, NOTIFY_TOPIC, type ApiRes, type NotifyState, type SetupDeps } from "./ebay-notify-setup.ts";
export { NOTIFY_TOPIC, setupNotifications, type SetupDeps, type SetupReport, type NotifyState } from "./ebay-notify-setup.ts";
import { ebayAppToken, ebayUserAccessToken } from "./ebay.ts";
import { listEbayConnectedStores } from "./ebay-tokens-db.ts";
import { getSetting, saveSetting } from "./settings-db.ts";
import { syncMarketplaceSalesForStore } from "./market-sync.ts";

// The IO half of eBay sale notifications: the delivery log, the per-store subscription state on
// her eBay connection row, the lookups that turn a payload into a store, eBay's public keys, and
// the subscribe flow the owner runs after deploy. The subscribe flow is written against SetupDeps
// so it is tested end to end with fakes and lives in ebay-notify-setup.ts; the real wiring is at
// the bottom of this file.

const API = "https://api.ebay.com";
const DESTINATION_SETTING = "ebay_notify_destination_id";

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensure() {
 if (ensured) return;
 const sql = db();
 // Same shape ebay-tokens-db creates; repeated here so the column adds below never race a fresh database.
 await sql`CREATE TABLE IF NOT EXISTS ebay_tokens (
  store_slug TEXT PRIMARY KEY, access_token TEXT NOT NULL, refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL, ebay_user TEXT, connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`ALTER TABLE ebay_tokens ADD COLUMN IF NOT EXISTS notify_subscription_id TEXT`;
 await sql`ALTER TABLE ebay_tokens ADD COLUMN IF NOT EXISTS notify_status TEXT`;
 await sql`ALTER TABLE ebay_tokens ADD COLUMN IF NOT EXISTS notify_since TIMESTAMPTZ`;
 await sql`ALTER TABLE ebay_tokens ADD COLUMN IF NOT EXISTS notify_last_error TEXT`;
 await sql`CREATE TABLE IF NOT EXISTS ebay_notifications (
  id SERIAL PRIMARY KEY,
  notification_id TEXT NOT NULL UNIQUE,
  topic TEXT NOT NULL,
  store_slug TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome TEXT NOT NULL,
  detail TEXT
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_ebay_notifications_received ON ebay_notifications (received_at DESC)`;
 ensured = true;
}

// ── Where eBay must reach us ────────────────────────────────────────────────────────────────────

/** The destination endpoint — one exact string, used both to answer the challenge and to register. */
export function notifyEndpoint(): string {
 return process.env.EBAY_NOTIFY_ENDPOINT || `${BASE_URL}/api/webhooks/ebay`;
}

/** Read from the environment only. Falls back to the account-deletion token so one value can serve both endpoints. */
export function notifyVerificationToken(): string | null {
 const t = process.env.EBAY_NOTIFY_VERIFICATION_TOKEN || process.env.EBAY_VERIFICATION_TOKEN || "";
 return t.trim() || null;
}

// ── The delivery log ────────────────────────────────────────────────────────────────────────────

export type NotificationRow = { id: number; notificationId: string; topic: string; storeSlug: string | null; receivedAt: string; outcome: string; detail: string | null };

export async function recordNotification(r: { id: string; topic: string; storeSlug: string | null; outcome: string; detail: string | null }): Promise<{ inserted: boolean }> {
 await ensure();
 const rows = (await db()`
  INSERT INTO ebay_notifications (notification_id, topic, store_slug, outcome, detail)
  VALUES (${r.id}, ${r.topic}, ${r.storeSlug}, ${r.outcome}, ${r.detail})
  ON CONFLICT (notification_id) DO NOTHING
  RETURNING id
 `) as any[];
 return { inserted: rows.length > 0 };
}

export async function updateNotificationOutcome(id: string, outcome: string, detail: string | null, storeSlug?: string | null): Promise<void> {
 await ensure();
 if (storeSlug === undefined) await db()`UPDATE ebay_notifications SET outcome = ${outcome}, detail = ${detail} WHERE notification_id = ${id}`;
 else await db()`UPDATE ebay_notifications SET outcome = ${outcome}, detail = ${detail}, store_slug = ${storeSlug} WHERE notification_id = ${id}`;
}

export async function listRecentNotifications(limit = 10): Promise<NotificationRow[]> {
 await ensure();
 const rows = (await db()`SELECT id, notification_id, topic, store_slug, received_at, outcome, detail FROM ebay_notifications ORDER BY received_at DESC, id DESC LIMIT ${limit}`.catch(() => [])) as any[];
 return rows.map((r) => ({ id: Number(r.id), notificationId: String(r.notification_id), topic: String(r.topic), storeSlug: r.store_slug ?? null, receivedAt: new Date(r.received_at).toISOString(), outcome: String(r.outcome), detail: r.detail ?? null }));
}

// ── Which store ─────────────────────────────────────────────────────────────────────────────────

/** SKU on eBay = our item id; the cross_listings row says whose it is. */
export async function storesBySku(skus: string[]): Promise<string[]> {
 if (!skus.length) return [];
 await ensure();
 const rows = (await db()`SELECT DISTINCT store_slug FROM cross_listings WHERE platform = 'ebay' AND item_id = ANY(${skus})`.catch(() => [])) as any[];
 return rows.map((r) => String(r.store_slug));
}

/** A listing id appears in the stored listing URL (…/itm/<id>). */
export async function storesByListingId(ids: string[]): Promise<string[]> {
 const clean = ids.filter((i) => /^\d{6,20}$/.test(i));
 if (!clean.length) return [];
 await ensure();
 const patterns = clean.map((i) => `%/itm/${i}%`);
 const rows = (await db()`SELECT DISTINCT store_slug FROM cross_listings WHERE platform = 'ebay' AND external_url LIKE ANY(${patterns})`.catch(() => [])) as any[];
 return rows.map((r) => String(r.store_slug));
}

export async function storesByEbayUser(users: string[]): Promise<string[]> {
 const clean = users.map((u) => u.toLowerCase()).filter(Boolean);
 if (!clean.length) return [];
 await ensure();
 const rows = (await db()`SELECT store_slug FROM ebay_tokens WHERE lower(ebay_user) = ANY(${clean})`.catch(() => [])) as any[];
 return rows.map((r) => String(r.store_slug));
}

// ── Per-store subscription state (on her eBay connection row) ──────────────────────────────────

export async function getNotifyState(slug: string): Promise<NotifyState | null> {
 await ensure();
 const rows = (await db()`SELECT notify_subscription_id, notify_status, notify_since, notify_last_error FROM ebay_tokens WHERE store_slug = ${slug} LIMIT 1`.catch(() => [])) as any[];
 if (!rows.length) return null;
 const r = rows[0];
 return { subscriptionId: r.notify_subscription_id ?? null, status: (r.notify_status as NotifyState["status"]) || "off", since: r.notify_since ? new Date(r.notify_since).toISOString() : null, lastError: r.notify_last_error ?? null };
}

export async function saveNotifyState(slug: string, patch: Partial<NotifyState>): Promise<void> {
 await ensure();
 const cur = (await getNotifyState(slug)) ?? { subscriptionId: null, status: "off" as const, since: null, lastError: null };
 const next = { ...cur, ...patch };
 await db()`UPDATE ebay_tokens SET notify_subscription_id = ${next.subscriptionId}, notify_status = ${next.status}, notify_since = ${next.since}, notify_last_error = ${next.lastError} WHERE store_slug = ${slug}`;
}

// ── eBay's public keys (for verifying deliveries) ──────────────────────────────────────────────

type CachedKey = { value: { key: string; digest?: string } | null; until: number };
const keyCache = new Map<string, CachedKey>();
// Uncached lookups per minute. eBay rotates a handful of keys; anything beyond this is a flood of
// forged headers, and the answer to those is "no" without a call to eBay.
const FETCH_BUDGET = 30;
let budget = { minute: 0, used: 0 };

export async function getEbayPublicKey(kid: string): Promise<{ key: string; digest?: string } | null> {
 const hit = keyCache.get(kid);
 if (hit && hit.until > Date.now()) return hit.value;
 const minute = Math.floor(Date.now() / 60_000);
 if (budget.minute !== minute) budget = { minute, used: 0 };
 if (++budget.used > FETCH_BUDGET) return null;
 if (keyCache.size > 500) keyCache.clear();
 const token = await ebayAppToken();
 if (!token) return null;
 const r = await ebayApi(token, "GET", `${NOTIFY}/public_key/${encodeURIComponent(kid)}`);
 const value = r.ok && typeof r.json?.key === "string" ? { key: String(r.json.key), digest: typeof r.json.digest === "string" ? r.json.digest : undefined } : null;
 // Keys are long-lived; an unknown kid is remembered briefly so a flood of forged headers cannot make us hammer eBay.
 keyCache.set(kid, { value, until: Date.now() + (value ? 24 * 3600_000 : 10 * 60_000) });
 return value;
}

// ── eBay Notification API calls ────────────────────────────────────────────────────────────────

async function ebayApi(token: string, method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<ApiRes> {
 const res = await fetch(`${API}${path}`, {
  method,
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
 }).catch(() => null);
 if (!res) return { ok: false, status: 0, json: null, location: null };
 const text = await res.text().catch(() => "");
 let json: any = null;
 try { json = text ? JSON.parse(text) : null; } catch { json = null; }
 return { ok: res.ok, status: res.status, json, location: res.headers.get("location") };
}

// ── Status (what the admin and the cron read) ──────────────────────────────────────────────────

export type NotifyStatus = {
 configured: boolean;
 endpoint: string;
 verificationTokenSet: boolean;
 destinationId: string | null;
 topic: string;
 summary: string;
 subscribed: number;
 lastReceivedAt: string | null;
 stores: Array<NotifyState & { slug: string; lastNotificationAt: string | null; lastOutcome: string | null }>;
 recent: NotificationRow[];
};

export async function notifyStatus(): Promise<NotifyStatus> {
 await ensure();
 const sql = db();
 const [stores, recent, destinationId] = await Promise.all([
  // A broadcast delivery is stored as "a, b, c": match the slug as a whole element of that list, never as a substring.
  sql`SELECT t.store_slug, t.notify_subscription_id, t.notify_status, t.notify_since, t.notify_last_error,
   (SELECT received_at FROM ebay_notifications n WHERE t.store_slug = ANY(string_to_array(n.store_slug, ', ')) ORDER BY received_at DESC LIMIT 1) AS last_at,
   (SELECT outcome FROM ebay_notifications n WHERE t.store_slug = ANY(string_to_array(n.store_slug, ', ')) ORDER BY received_at DESC LIMIT 1) AS last_outcome
   FROM ebay_tokens t ORDER BY t.store_slug`.catch(() => [] as any[]),
  listRecentNotifications(10),
  getSetting(DESTINATION_SETTING).catch(() => null),
 ]);
 const rows = (stores as any[]).map((r) => ({
  slug: String(r.store_slug), subscriptionId: r.notify_subscription_id ?? null, status: ((r.notify_status as NotifyState["status"]) || "off"),
  since: r.notify_since ? new Date(r.notify_since).toISOString() : null, lastError: r.notify_last_error ?? null,
  lastNotificationAt: r.last_at ? new Date(r.last_at).toISOString() : null, lastOutcome: r.last_outcome ?? null,
 }));
 const active = rows.filter((r) => r.status === "active" && r.since);
 const since = active.length ? active.map((r) => r.since as string).sort()[0] : null;
 const lastReceivedAt = recent[0]?.receivedAt ?? null;
 const verificationTokenSet = validVerificationToken(notifyVerificationToken());
 return {
  configured: !!(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET),
  endpoint: notifyEndpoint(), verificationTokenSet, destinationId, topic: NOTIFY_TOPIC,
  summary: describeNotifyState({ since, lastReceivedAt, now: Date.now() }),
  subscribed: active.length, lastReceivedAt, stores: rows, recent,
 };
}

// ── Real wiring ─────────────────────────────────────────────────────────────────────────────────

export function receiveDeps(): ReceiveDeps {
 return {
  now: () => Date.now(),
  endpoint: notifyEndpoint(),
  verificationToken: notifyVerificationToken(),
  publicKey: getEbayPublicKey,
  tradingCreds: () => {
   const devId = process.env.EBAY_DEV_ID, appId = process.env.EBAY_CLIENT_ID, certId = process.env.EBAY_CLIENT_SECRET;
   return devId && appId && certId ? { devId, appId, certId } : null;
  },
  storesBySku, storesByListingId, storesByEbayUser,
  connectedStores: listEbayConnectedStores,
  record: recordNotification,
  updateOutcome: updateNotificationOutcome,
  sync: (slug, since) => syncMarketplaceSalesForStore(slug, since, ["ebay"]),
 };
}

export function setupDeps(): SetupDeps {
 return {
  now: () => new Date().toISOString(),
  endpoint: notifyEndpoint(),
  verificationToken: notifyVerificationToken(),
  alertEmail: process.env.EBAY_NOTIFY_ALERT_EMAIL?.trim() || null,
  appToken: ebayAppToken,
  userToken: ebayUserAccessToken,
  api: ebayApi,
  getDestinationId: () => getSetting(DESTINATION_SETTING),
  saveDestinationId: (id) => saveSetting(DESTINATION_SETTING, id),
  connectedStores: listEbayConnectedStores,
  getState: getNotifyState,
  saveState: saveNotifyState,
 };
}
