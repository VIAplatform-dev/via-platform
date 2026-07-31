import { neon } from "@neondatabase/serverless";
import { getStorefrontBySlug } from "@/app/lib/storefront-db";
import { BASE_URL } from "@/app/lib/base-url";

// Per-store Instagram auto-posting for the Owner Workspace.
//
// When an OS store publishes a new item, VYA posts a 9:16 story card
// (/api/story/{itemId}) to THAT store's Instagram Story via Meta's Content Publishing
// API. The story drives buyers to the store's OWN storefront product page — VYA monetizes
// the checkout rails (1% + shipping), not a marketplace click, so no attribution link is
// involved. The card is just the product photo + "Shop now".
//
// Reality of Meta's API (be honest about the limits):
//   • Publishing an IMAGE to Stories (media_type=STORIES) is supported.
//   • A clickable link STICKER is NOT available via the API — so the product link is
//     delivered either by the store adding a native link sticker by hand, or by the
//     Messaging auto-DM-on-story-reply flow (built separately).
//   • Auto-publish needs Advanced Access (App Review + Business Verification).
//
// Dormant per store until that store connects Instagram (we store their ig_user_id +
// a long-lived access_token). The OAuth exchange itself needs the Meta app creds
// (IG_APP_ID / IG_APP_SECRET); everything no-ops gracefully when unset.

const GRAPH = "https://graph.facebook.com/v21.0";

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return neon(url);
}

export type StoreIgConnection = {
 storeSlug: string;
 igUserId: string;
 igUsername: string | null;
 accessToken: string;
 autoPost: boolean;
 connectedAt: Date;
 tokenExpiresAt: Date | null;
};

// True once the Meta app is configured well enough to run the connect (OAuth) flow.
export function igAppConfigured(): boolean {
 return Boolean(process.env.IG_APP_ID && process.env.IG_APP_SECRET);
}

let _ready = false;
async function ensureTable(sql: ReturnType<typeof db>) {
 if (_ready) return;
 await sql`CREATE TABLE IF NOT EXISTS store_instagram (
  store_slug TEXT PRIMARY KEY,
  ig_user_id TEXT NOT NULL,
  ig_username TEXT,
  access_token TEXT NOT NULL,
  auto_post BOOLEAN NOT NULL DEFAULT true,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  token_expires_at TIMESTAMPTZ
 )`.catch(() => {});
 _ready = true;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToConn(r: any): StoreIgConnection {
 return {
  storeSlug: r.store_slug,
  igUserId: r.ig_user_id,
  igUsername: r.ig_username ?? null,
  accessToken: r.access_token,
  autoPost: !!r.auto_post,
  connectedAt: new Date(r.connected_at),
  tokenExpiresAt: r.token_expires_at ? new Date(r.token_expires_at) : null,
 };
}

export async function getStoreIgConnection(storeSlug: string): Promise<StoreIgConnection | null> {
 const sql = db();
 await ensureTable(sql);
 const rows = (await sql`
  SELECT * FROM store_instagram WHERE store_slug = ${storeSlug} LIMIT 1
 `.catch(() => [])) as any[];
 return rows[0] ? rowToConn(rows[0]) : null;
}

export async function saveStoreIgConnection(conn: {
 storeSlug: string;
 igUserId: string;
 igUsername?: string | null;
 accessToken: string;
 tokenExpiresAt?: Date | null;
}): Promise<void> {
 const sql = db();
 await ensureTable(sql);
 // Preserve an existing auto_post preference on reconnect; default true on first connect.
 await sql`
  INSERT INTO store_instagram (store_slug, ig_user_id, ig_username, access_token, token_expires_at)
  VALUES (${conn.storeSlug}, ${conn.igUserId}, ${conn.igUsername ?? null}, ${conn.accessToken}, ${conn.tokenExpiresAt ?? null})
  ON CONFLICT (store_slug) DO UPDATE SET
   ig_user_id = EXCLUDED.ig_user_id,
   ig_username = EXCLUDED.ig_username,
   access_token = EXCLUDED.access_token,
   token_expires_at = EXCLUDED.token_expires_at,
   connected_at = now()
 `.catch(() => {});
}

export async function setStoreIgAutoPost(storeSlug: string, enabled: boolean): Promise<void> {
 const sql = db();
 await ensureTable(sql);
 await sql`UPDATE store_instagram SET auto_post = ${enabled} WHERE store_slug = ${storeSlug}`.catch(() => {});
}

export async function disconnectStoreIg(storeSlug: string): Promise<void> {
 const sql = db();
 await ensureTable(sql);
 await sql`DELETE FROM store_instagram WHERE store_slug = ${storeSlug}`.catch(() => {});
}

// The public card URL Meta will fetch to build the story. /api/story is a public route.
export function storyCardUrl(itemId: string, cta?: string): string {
 const base = `${BASE_URL}/api/story/${encodeURIComponent(itemId)}`;
 return cta ? `${base}?cta=${encodeURIComponent(cta)}` : base;
}

// The destination a story drives to: the store's OWN storefront product page. VYA monetizes
// the checkout on these rails (1% + shipping), so there's no marketplace/attribution link —
// the buyer lands on the seller's own shop. Prefers a connected custom domain, then the
// branded {handle}.vyaplatform.com subdomain, then the canonical path.
export async function storefrontProductUrl(storeSlug: string, itemId: string): Promise<string> {
 const sf = await getStorefrontBySlug(storeSlug).catch(() => null);
 const handle = sf?.handle ?? storeSlug;
 if (sf?.customDomain) return `https://${sf.customDomain}/p/${itemId}`;
 return `${BASE_URL}/s/${handle}/p/${itemId}`;
}

export type PublishResult =
 | { ok: true; storyId: string }
 | { ok: false; reason: "not_connected" | "api_error" | "no_token"; detail?: string };

// Publish a product's story card to the connected store's IG Story.
// Two-step Content Publishing: create a STORIES media container, then publish it.
export async function publishItemStory(
 storeSlug: string,
 itemId: string,
 opts?: { cta?: string }
): Promise<PublishResult> {
 const conn = await getStoreIgConnection(storeSlug);
 if (!conn) return { ok: false, reason: "not_connected" };
 if (!conn.accessToken) return { ok: false, reason: "no_token" };

 const imageUrl = storyCardUrl(itemId, opts?.cta);

 try {
  // 1. Create the media container.
  const createUrl = new URL(`${GRAPH}/${conn.igUserId}/media`);
  createUrl.searchParams.set("media_type", "STORIES");
  createUrl.searchParams.set("image_url", imageUrl);
  createUrl.searchParams.set("access_token", conn.accessToken);
  const createRes = await fetch(createUrl, { method: "POST", signal: AbortSignal.timeout(20000) });
  const createBody = await createRes.json().catch(() => ({}));
  if (!createRes.ok || !createBody?.id) {
   return { ok: false, reason: "api_error", detail: JSON.stringify(createBody?.error ?? createBody) };
  }

  // 2. Publish the container.
  const pubUrl = new URL(`${GRAPH}/${conn.igUserId}/media_publish`);
  pubUrl.searchParams.set("creation_id", String(createBody.id));
  pubUrl.searchParams.set("access_token", conn.accessToken);
  const pubRes = await fetch(pubUrl, { method: "POST", signal: AbortSignal.timeout(20000) });
  const pubBody = await pubRes.json().catch(() => ({}));
  if (!pubRes.ok || !pubBody?.id) {
   return { ok: false, reason: "api_error", detail: JSON.stringify(pubBody?.error ?? pubBody) };
  }

  return { ok: true, storyId: String(pubBody.id) };
 } catch (e) {
  return { ok: false, reason: "api_error", detail: e instanceof Error ? e.message : String(e) };
 }
}

// Best-effort trigger for the item-publish hook: only posts when the store is connected
// AND has auto_post enabled. Never throws — a failed story must not break item publishing.
export async function maybeAutoPostStory(storeSlug: string, itemId: string): Promise<void> {
 try {
  const conn = await getStoreIgConnection(storeSlug);
  if (!conn || !conn.autoPost) return;
  await publishItemStory(storeSlug, itemId);
 } catch {
  /* swallow — auto-post is non-critical */
 }
}
