import { neon } from "@neondatabase/serverless";
import { normalizePrefs, mergePrefs, type NotificationPrefs, type NotificationPrefsPatch } from "./notification-prefs-core.ts";

// Per-store notification preferences: which pushes and emails she wants. One JSONB row per store;
// the shape, defaults and merging live in notification-prefs-core.ts. A store with no row gets the
// defaults, which is what every store had before this table existed.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensure() {
 if (ensured) return;
 await db()`CREATE TABLE IF NOT EXISTS store_notification_prefs (
  store_slug TEXT PRIMARY KEY,
  prefs JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 ensured = true;
}

export async function getNotificationPrefs(storeSlug: string): Promise<NotificationPrefs> {
 await ensure();
 const rows = (await db()`SELECT prefs FROM store_notification_prefs WHERE store_slug = ${storeSlug} LIMIT 1`) as Array<{ prefs: unknown }>;
 const raw = rows[0]?.prefs;
 return normalizePrefs(typeof raw === "string" ? JSON.parse(raw) : raw);
}

/** Apply a patch (only the keys named change) and return the whole, saved preferences. */
export async function setNotificationPrefs(storeSlug: string, patch: NotificationPrefsPatch): Promise<NotificationPrefs> {
 await ensure();
 const next = mergePrefs(await getNotificationPrefs(storeSlug), patch);
 await db()`
  INSERT INTO store_notification_prefs (store_slug, prefs, updated_at)
  VALUES (${storeSlug}, ${JSON.stringify(next)}::jsonb, now())
  ON CONFLICT (store_slug) DO UPDATE SET prefs = ${JSON.stringify(next)}::jsonb, updated_at = now()
 `;
 return next;
}
