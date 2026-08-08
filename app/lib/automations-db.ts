import { neon } from "@neondatabase/serverless";

// Store automations — the automated emails VYA sends on a store's behalf. Two kinds:
//  • builtin  — VYA's own flows (abandoned cart, new arrivals…). A row exists only
//               when the store has OVERRIDDEN the default (on). No row = on.
//  • custom   — the store's own automation: a trigger + an email to send.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 await db()`
  CREATE TABLE IF NOT EXISTS store_automations (
   id SERIAL PRIMARY KEY,
   store_slug TEXT NOT NULL,
   kind TEXT NOT NULL DEFAULT 'builtin',
   akey TEXT,
   name TEXT,
   trigger TEXT,
   subject TEXT,
   body TEXT,
   enabled BOOLEAN NOT NULL DEFAULT true,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
 `;
 await db()`CREATE INDEX IF NOT EXISTS idx_store_automations_store ON store_automations (store_slug)`;
 await db()`CREATE UNIQUE INDEX IF NOT EXISTS idx_store_automations_builtin ON store_automations (store_slug, akey) WHERE kind = 'builtin'`;
 ensured = true;
}

// VYA's built-in flows, each backed by a scheduled job that ACTUALLY honors these per-store toggles
// (sendNewListingsDigest + sendAbandonedCartEmail both gate on isAutomationEnabled). Only flows that
// send AS the store belong here. Saved-search / viewed-item / win-back were removed: those crons are
// marketplace-level buyer notifications (VYA-branded, keyed on user_id across ALL stores), so a
// per-store toggle never controlled them — showing it was a dead switch. Re-add only if/when a
// genuinely store-scoped version exists.
export const BUILTIN_AUTOMATIONS: { key: string; name: string; body: string; cadence: string }[] = [
 { key: "abandoned_cart", name: "Abandoned cart", body: "Nudges a shopper who added to cart but didn’t check out — with the item and a link back.", cadence: "Within a day of drop-off" },
 { key: "new_arrivals", name: "New arrivals", body: "Emails your audience when you publish fresh pieces, so your best customers see them first.", cadence: "On a new drop" },
];
export const CUSTOM_TRIGGERS: { value: string; label: string }[] = [
 { value: "new_listing", label: "When I publish a new listing" },
 { value: "new_customer", label: "When a new customer is added" },
 { value: "order_placed", label: "After a customer places an order" },
];

export type BuiltinAutomation = { kind: "builtin"; key: string; name: string; body: string; cadence: string; enabled: boolean };
export type CustomAutomation = { kind: "custom"; id: number; name: string; trigger: string; subject: string; body: string; enabled: boolean };

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function getAutomations(storeSlug: string): Promise<{ builtin: BuiltinAutomation[]; custom: CustomAutomation[] }> {
 await ensureTable();
 const rows = (await db()`SELECT id, kind, akey, name, trigger, subject, body, enabled FROM store_automations WHERE store_slug = ${storeSlug} ORDER BY created_at DESC`.catch(() => [])) as any[];
 const overrides = new Map<string, boolean>();
 const custom: CustomAutomation[] = [];
 for (const r of rows) {
 if (r.kind === "builtin" && r.akey) overrides.set(r.akey, r.enabled !== false);
 else if (r.kind === "custom") custom.push({ kind: "custom", id: Number(r.id), name: r.name || "Untitled", trigger: r.trigger || "", subject: r.subject || "", body: r.body || "", enabled: r.enabled !== false });
 }
 const builtin: BuiltinAutomation[] = BUILTIN_AUTOMATIONS.map((b) => ({ kind: "builtin", ...b, enabled: overrides.has(b.key) ? (overrides.get(b.key) as boolean) : true }));
 return { builtin, custom };
}

/** Is a built-in flow on for this store? Default on unless explicitly turned off. */
export async function isAutomationEnabled(storeSlug: string, key: string): Promise<boolean> {
 await ensureTable();
 const rows = (await db()`SELECT enabled FROM store_automations WHERE store_slug = ${storeSlug} AND kind = 'builtin' AND akey = ${key} LIMIT 1`.catch(() => [])) as any[];
 return rows.length ? rows[0].enabled !== false : true;
}

/** Toggle a built-in flow (upsert the override). */
export async function setBuiltinEnabled(storeSlug: string, key: string, enabled: boolean): Promise<void> {
 if (!BUILTIN_AUTOMATIONS.some((b) => b.key === key)) return;
 await ensureTable();
 await db()`
  INSERT INTO store_automations (store_slug, kind, akey, enabled)
  VALUES (${storeSlug}, 'builtin', ${key}, ${enabled})
  ON CONFLICT (store_slug, akey) WHERE kind = 'builtin' DO UPDATE SET enabled = ${enabled}
 `.catch(async () => {
 // Fallback for envs without the partial-unique upsert: update-then-insert.
 const done = (await db()`UPDATE store_automations SET enabled = ${enabled} WHERE store_slug = ${storeSlug} AND kind = 'builtin' AND akey = ${key} RETURNING id`.catch(() => [])) as any[];
 if (!done.length) await db()`INSERT INTO store_automations (store_slug, kind, akey, enabled) VALUES (${storeSlug}, 'builtin', ${key}, ${enabled})`.catch(() => {});
 });
}

export async function addCustomAutomation(storeSlug: string, a: { name: string; trigger: string; subject: string; body: string }): Promise<void> {
 await ensureTable();
 await db()`
  INSERT INTO store_automations (store_slug, kind, name, trigger, subject, body, enabled)
  VALUES (${storeSlug}, 'custom', ${a.name.slice(0, 120)}, ${a.trigger.slice(0, 40)}, ${a.subject.slice(0, 200)}, ${a.body.slice(0, 4000)}, true)
 `.catch(() => {});
}

export async function setCustomEnabled(storeSlug: string, id: number, enabled: boolean): Promise<void> {
 await ensureTable();
 await db()`UPDATE store_automations SET enabled = ${enabled} WHERE store_slug = ${storeSlug} AND kind = 'custom' AND id = ${id}`.catch(() => {});
}

export async function removeCustomAutomation(storeSlug: string, id: number): Promise<void> {
 await ensureTable();
 await db()`DELETE FROM store_automations WHERE store_slug = ${storeSlug} AND kind = 'custom' AND id = ${id}`.catch(() => {});
}

/** Active custom automations for a given trigger — used by the trigger hooks. */
export async function getCustomAutomationsForTrigger(storeSlug: string, trigger: string): Promise<CustomAutomation[]> {
 await ensureTable();
 const rows = (await db()`SELECT id, name, trigger, subject, body, enabled FROM store_automations WHERE store_slug = ${storeSlug} AND kind = 'custom' AND trigger = ${trigger} AND enabled = true`.catch(() => [])) as any[];
 return rows.map((r) => ({ kind: "custom" as const, id: Number(r.id), name: r.name || "", trigger: r.trigger || "", subject: r.subject || "", body: r.body || "", enabled: true }));
}
