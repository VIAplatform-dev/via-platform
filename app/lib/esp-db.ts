// Which email tool a store connected, and what happened last time we synced.
//
// The key is a credential to someone else's account. It is stored so syncs can run without the
// seller re-pasting it, never returned to the browser, and shown only masked.
import { neon } from "@neondatabase/serverless";
import type { EspProvider } from "./esp-core";

const db = () => neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");

let ensured = false;
async function ensure() {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS store_esp (
  store_slug TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  api_key TEXT NOT NULL,
  list_id TEXT,
  list_name TEXT,
  account_name TEXT,
  auto_sync BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_sync_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 // Signing in through Mailchimp or Klaviyo, rather than pasting a key. Nullable because a store
 // connected the old way still works — api_key stays, and these stay empty.
 for (const col of [
  "access_token TEXT", "refresh_token TEXT", "token_expires_at TIMESTAMPTZ",
  "server_prefix TEXT",           // Mailchimp's datacentre, e.g. "us21" — their API host comes from it
  "auth_kind TEXT NOT NULL DEFAULT 'key'",  // 'oauth' | 'key'
  // True (the default) hands the MARKETING emails to their tool, so nobody gets two of the same.
  // Order emails are never affected — see email-ownership.ts.
  "hand_over_marketing BOOLEAN NOT NULL DEFAULT true",
 ]) await sql`ALTER TABLE store_esp ADD COLUMN IF NOT EXISTS ${sql.unsafe(col)}`;
 ensured = true;
}

export type EspConnection = {
 provider: EspProvider;
 /** The pasted key, for stores connected before sign-in existed. Empty on an OAuth connection. */
 apiKey: string;
 authKind: "oauth" | "key";
 accessToken: string | null;
 refreshToken: string | null;
 tokenExpiresAt: string | null;
 /** Mailchimp only: their datacentre, learned from the metadata call after the exchange. */
 serverPrefix: string | null;
 listId: string | null;
 listName: string | null;
 accountName: string | null;
 autoSync: boolean;
 handOverMarketing: boolean;
 lastSyncAt: string | null;
 lastSyncNote: string | null;
};

export async function getEspConnection(storeSlug: string): Promise<EspConnection | null> {
 await ensure();
 const rows = await db()`SELECT * FROM store_esp WHERE store_slug = ${storeSlug} LIMIT 1` as Array<Record<string, unknown>>;
 const r = rows[0];
 if (!r) return null;
 return {
  provider: r.provider as EspProvider,
  apiKey: String(r.api_key || ""),
  authKind: (r.auth_kind as "oauth" | "key") || "key",
  accessToken: (r.access_token as string) ?? null,
  refreshToken: (r.refresh_token as string) ?? null,
  tokenExpiresAt: r.token_expires_at ? new Date(r.token_expires_at as string).toISOString() : null,
  serverPrefix: (r.server_prefix as string) ?? null,
  listId: (r.list_id as string) ?? null,
  listName: (r.list_name as string) ?? null,
  accountName: (r.account_name as string) ?? null,
  autoSync: r.auto_sync !== false,
  handOverMarketing: r.hand_over_marketing !== false,
  lastSyncAt: r.last_sync_at ? new Date(r.last_sync_at as string).toISOString() : null,
  lastSyncNote: (r.last_sync_note as string) ?? null,
 };
}

export async function saveEspConnection(storeSlug: string, c: {
 provider: EspProvider; apiKey: string; accountName?: string | null; listId?: string | null; listName?: string | null;
}): Promise<void> {
 await ensure();
 await db()`INSERT INTO store_esp (store_slug, provider, api_key, account_name, list_id, list_name, updated_at)
  VALUES (${storeSlug}, ${c.provider}, ${c.apiKey}, ${c.accountName ?? null}, ${c.listId ?? null}, ${c.listName ?? null}, now())
  ON CONFLICT (store_slug) DO UPDATE SET
   provider = ${c.provider}, api_key = ${c.apiKey},
   account_name = ${c.accountName ?? null},
   list_id = COALESCE(${c.listId ?? null}, store_esp.list_id),
   list_name = COALESCE(${c.listName ?? null}, store_esp.list_name),
   updated_at = now()`;
}

export async function setEspList(storeSlug: string, listId: string, listName: string): Promise<void> {
 await ensure();
 await db()`UPDATE store_esp SET list_id = ${listId}, list_name = ${listName}, updated_at = now() WHERE store_slug = ${storeSlug}`;
}

export async function setEspAutoSync(storeSlug: string, on: boolean): Promise<void> {
 await ensure();
 await db()`UPDATE store_esp SET auto_sync = ${on}, updated_at = now() WHERE store_slug = ${storeSlug}`;
}

export async function recordEspSync(storeSlug: string, note: string): Promise<void> {
 await ensure();
 await db()`UPDATE store_esp SET last_sync_at = now(), last_sync_note = ${note.slice(0, 200)}, updated_at = now() WHERE store_slug = ${storeSlug}`;
}

export async function disconnectEsp(storeSlug: string): Promise<void> {
 await ensure();
 await db()`DELETE FROM store_esp WHERE store_slug = ${storeSlug}`;
}

/** Save what came back from signing in. Replaces any pasted key that was there before. */
export async function saveEspOauth(storeSlug: string, c: {
 provider: EspProvider; accessToken: string; refreshToken?: string | null;
 expiresAt?: string | null; serverPrefix?: string | null; accountName?: string | null;
 listId?: string | null; listName?: string | null;
}): Promise<void> {
 await ensure();
 await db()`INSERT INTO store_esp
   (store_slug, provider, api_key, auth_kind, access_token, refresh_token, token_expires_at, server_prefix, account_name, list_id, list_name, updated_at)
  VALUES (${storeSlug}, ${c.provider}, '', 'oauth', ${c.accessToken}, ${c.refreshToken ?? null},
          ${c.expiresAt ?? null}, ${c.serverPrefix ?? null}, ${c.accountName ?? null}, ${c.listId ?? null}, ${c.listName ?? null}, now())
  ON CONFLICT (store_slug) DO UPDATE SET
   provider = ${c.provider}, api_key = '', auth_kind = 'oauth',
   access_token = ${c.accessToken},
   -- A refresh response doesn't always return a new refresh token; keep the one we have.
   refresh_token = COALESCE(${c.refreshToken ?? null}, store_esp.refresh_token),
   token_expires_at = ${c.expiresAt ?? null},
   server_prefix = COALESCE(${c.serverPrefix ?? null}, store_esp.server_prefix),
   account_name = COALESCE(${c.accountName ?? null}, store_esp.account_name),
   list_id = COALESCE(${c.listId ?? null}, store_esp.list_id),
   list_name = COALESCE(${c.listName ?? null}, store_esp.list_name),
   updated_at = now()`;
}

/** After a refresh: the new access token and when it dies. */
export async function updateEspToken(storeSlug: string, accessToken: string, expiresAt: string | null, refreshToken?: string | null): Promise<void> {
 await ensure();
 await db()`UPDATE store_esp SET access_token = ${accessToken}, token_expires_at = ${expiresAt},
   refresh_token = COALESCE(${refreshToken ?? null}, refresh_token), updated_at = now()
  WHERE store_slug = ${storeSlug}`;
}

/** Whether their tool sends the marketing, or VYA carries on doing it. */
export async function setEspHandover(storeSlug: string, on: boolean): Promise<void> {
 await ensure();
 await db()`UPDATE store_esp SET hand_over_marketing = ${on}, updated_at = now() WHERE store_slug = ${storeSlug}`;
}
