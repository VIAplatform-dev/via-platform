import { neon } from "@neondatabase/serverless";

// Per-store inbox settings: messaging + offers, and how offers behave. A store can turn either
// off entirely, and choose whether an accepted offer is binding (reserves the piece + the buyer
// checks out at the agreed price) or just a soft agreement.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

export type InboxSettings = {
 messagingEnabled: boolean;
 offersEnabled: boolean;
 offersBinding: boolean;
 minOfferPct: number; // auto-decline offers below this % of list price; 0 = no floor
 notifyPhone: string | null; // seller's mobile — texted (via Linq) on a new buyer message
 notifySms: boolean; // whether to send that text notification
};

export const DEFAULT_INBOX_SETTINGS: InboxSettings = {
 messagingEnabled: true,
 offersEnabled: true,
 offersBinding: false,
 minOfferPct: 0,
 notifyPhone: null,
 notifySms: false,
};

let ensured = false;
async function ensure() {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS storefront_settings (
 store_slug TEXT PRIMARY KEY,
 messaging_enabled BOOLEAN NOT NULL DEFAULT true,
 offers_enabled BOOLEAN NOT NULL DEFAULT true,
 offers_binding BOOLEAN NOT NULL DEFAULT false,
 min_offer_pct INTEGER NOT NULL DEFAULT 0,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`ALTER TABLE storefront_settings ADD COLUMN IF NOT EXISTS notify_phone TEXT`.catch(() => {});
 await sql`ALTER TABLE storefront_settings ADD COLUMN IF NOT EXISTS notify_sms BOOLEAN NOT NULL DEFAULT false`.catch(() => {});
 ensured = true;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function getInboxSettings(storeSlug: string): Promise<InboxSettings> {
 await ensure();
 const rows = (await db()`SELECT * FROM storefront_settings WHERE store_slug = ${storeSlug} LIMIT 1`.catch(() => [])) as any[];
 if (!rows.length) return { ...DEFAULT_INBOX_SETTINGS };
 const r = rows[0];
 return {
 messagingEnabled: r.messaging_enabled !== false,
 offersEnabled: r.offers_enabled !== false,
 offersBinding: !!r.offers_binding,
 minOfferPct: Math.max(0, Math.min(100, Number(r.min_offer_pct) || 0)),
 notifyPhone: r.notify_phone ?? null,
 notifySms: !!r.notify_sms,
 };
}

export async function updateInboxSettings(storeSlug: string, patch: Partial<InboxSettings>): Promise<InboxSettings> {
 await ensure();
 const next = { ...(await getInboxSettings(storeSlug)), ...patch };
 next.minOfferPct = Math.max(0, Math.min(100, Math.round(next.minOfferPct)));
 const phone = next.notifyPhone ? String(next.notifyPhone).trim().slice(0, 32) || null : null;
 await db()`INSERT INTO storefront_settings (store_slug, messaging_enabled, offers_enabled, offers_binding, min_offer_pct, notify_phone, notify_sms, updated_at)
 VALUES (${storeSlug}, ${next.messagingEnabled}, ${next.offersEnabled}, ${next.offersBinding}, ${next.minOfferPct}, ${phone}, ${next.notifySms}, now())
 ON CONFLICT (store_slug) DO UPDATE SET
 messaging_enabled = EXCLUDED.messaging_enabled, offers_enabled = EXCLUDED.offers_enabled,
 offers_binding = EXCLUDED.offers_binding, min_offer_pct = EXCLUDED.min_offer_pct,
 notify_phone = EXCLUDED.notify_phone, notify_sms = EXCLUDED.notify_sms, updated_at = now()`;
 return { ...next, notifyPhone: phone };
}
