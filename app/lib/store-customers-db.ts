import { neon } from "@neondatabase/serverless";
import type { ParsedCustomer } from "./parse-customers";

// A seller's existing customer list, brought over at onboarding. Stored per store
// and deduped by email so re-uploading is safe. This is the seller's own audience
// (their relationship) — VYA holds it on their behalf.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS store_customers (
 id SERIAL PRIMARY KEY,
 store_slug TEXT NOT NULL,
 email TEXT NOT NULL,
 name TEXT,
 phone TEXT,
 source TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (store_slug, email)
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_store_customers_store ON store_customers (store_slug)`;
 // Marketing consent — defaults to subscribed; the seller's email campaigns honor it.
 await sql`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS email_subscribed BOOLEAN NOT NULL DEFAULT true`;
 // CRM: free-form tags (segments) and a private note per contact.
 await sql`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'`;
 await sql`ALTER TABLE store_customers ADD COLUMN IF NOT EXISTS notes TEXT`;
 ensured = true;
}

// Display location from the buyer's most recent shipping address (US/CA/etc. codes
// expanded to full names so the column reads like "South Lyon MI, United States").
const COUNTRY_NAMES: Record<string, string> = { US: "United States", USA: "United States", CA: "Canada", GB: "United Kingdom", UK: "United Kingdom", AU: "Australia" };
function formatLocation(city: unknown, state: unknown, country: unknown): string | null {
 const co = country ? (COUNTRY_NAMES[String(country).toUpperCase()] || String(country)) : null;
 const cityState = [city, state].map((x) => (x ? String(x).trim() : "")).filter(Boolean).join(" ");
 if (cityState && co) return `${cityState}, ${co}`;
 return cityState || co || null;
}

/** Upsert a parsed customer list for a store. Returns how many were newly added. */
export async function importCustomers(
 storeSlug: string,
 rows: ParsedCustomer[],
 source: string | null,
): Promise<{ added: number; total: number }> {
 await ensureTable();
 const sql = db();
 const before = await getCustomerCount(storeSlug);
 for (const r of rows) {
 await sql`INSERT INTO store_customers (store_slug, email, name, phone, source)
 VALUES (${storeSlug}, ${r.email}, ${r.name}, ${r.phone}, ${source})
 ON CONFLICT (store_slug, email) DO UPDATE SET
 name = COALESCE(EXCLUDED.name, store_customers.name),
 phone = COALESCE(EXCLUDED.phone, store_customers.phone)`;
 }
 const total = await getCustomerCount(storeSlug);

 // A store that connected Klaviyo or Mailchimp expects someone who signs up or buys to appear there
 // now, not at the next full sync. A CSV import of ten thousand is a different case — that's what
 // "Send everyone now" is for — so only small, live additions go across immediately.
 if (rows.length <= 50) {
  const { mirrorToEsp } = await import("./esp-mirror");
  for (const r of rows) {
   if (r.email) mirrorToEsp(storeSlug, { email: r.email.toLowerCase().trim(), name: r.name, phone: r.phone, subscribed: true });
  }
 }
 return { added: total - before, total };
}

export async function getCustomerCount(storeSlug: string): Promise<number> {
 await ensureTable();
 const rows = await db()`SELECT COUNT(*)::int AS n FROM store_customers WHERE store_slug = ${storeSlug}`;
 return (rows[0] as { n: number })?.n ?? 0;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function listCustomers(storeSlug: string, limit = 50): Promise<{ email: string; name: string | null; phone: string | null }[]> {
 await ensureTable();
 const rows = await db()`SELECT email, name, phone FROM store_customers WHERE store_slug = ${storeSlug} ORDER BY created_at DESC LIMIT ${limit}`;
 return (rows as any[]).map((r) => ({ email: r.email, name: r.name ?? null, phone: r.phone ?? null }));
}

// A unified customer = the store's brought-over audience PLUS anyone who has
// actually bought on VYA, merged by email. Buyers carry order count / total spent /
// last order; imported-only contacts carry when they were added. This is the
// seller's CRM view — their relationship, held on their behalf.
export type CustomerProfile = {
 email: string;
 name: string | null;
 phone: string | null;
 location: string | null;
 subscribed: boolean;
 source: "imported" | "buyer" | "both";
 orders: number;
 spentCents: number;
 lastOrderAt: string | null; // ISO
 addedAt: string | null; // ISO — when imported
 tags: string[]; // seller-defined segments
 notes: string | null; // seller's private note
};

export async function listCustomerProfiles(storeSlug: string): Promise<CustomerProfile[]> {
 await ensureTable();
 const sql = db();

 const imported = (await sql`
 SELECT email, name, phone, email_subscribed, created_at, tags, notes FROM store_customers WHERE store_slug = ${storeSlug}
 `) as any[];

 // Buyers: aggregate real orders for this store by email, plus their latest shipping
 // location. Wrapped defensively so the list still renders from the imported audience
 // if the orders table isn't present.
 let buyers: any[] = [];
 try {
 buyers = (await sql`
 WITH agg AS (
 SELECT lower(o.buyer_email) AS email,
 max(o.buyer_name) AS name,
 max(o.buyer_phone) AS phone,
 count(*)::int AS orders,
 coalesce(sum(o.amount_cents), 0)::int AS spent_cents,
 max(o.paid_at) AS last_order
 FROM orders o
 JOIN sellers s ON s.id = o.seller_id
 WHERE s.slug = ${storeSlug}
 AND o.buyer_email IS NOT NULL AND o.buyer_email <> ''
 AND o.status IN ('paid', 'shipped', 'delivered')
 GROUP BY lower(o.buyer_email)
 ),
 loc AS (
 SELECT DISTINCT ON (lower(o.buyer_email)) lower(o.buyer_email) AS email,
 o.ship_city, o.ship_state, o.ship_country
 FROM orders o
 JOIN sellers s ON s.id = o.seller_id
 WHERE s.slug = ${storeSlug}
 AND o.buyer_email IS NOT NULL AND o.buyer_email <> ''
 ORDER BY lower(o.buyer_email), o.paid_at DESC NULLS LAST
 )
 SELECT a.email, a.name, a.phone, a.orders, a.spent_cents, a.last_order,
 l.ship_city, l.ship_state, l.ship_country
 FROM agg a
 LEFT JOIN loc l USING (email)
 `) as any[];
 } catch { buyers = []; }

 const map = new Map<string, CustomerProfile>();
 const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

 for (const r of imported) {
 const email = String(r.email || "").toLowerCase().trim();
 if (!email) continue;
 map.set(email, { email, name: r.name ?? null, phone: r.phone ?? null, location: null, subscribed: r.email_subscribed !== false, source: "imported", orders: 0, spentCents: 0, lastOrderAt: null, addedAt: iso(r.created_at), tags: Array.isArray(r.tags) ? r.tags : [], notes: r.notes ?? null });
 }
 for (const r of buyers) {
 const email = String(r.email || "").toLowerCase().trim();
 if (!email) continue;
 const location = formatLocation(r.ship_city, r.ship_state, r.ship_country);
 const existing = map.get(email);
 if (existing) {
 existing.source = "both";
 existing.orders = r.orders;
 existing.spentCents = r.spent_cents;
 existing.lastOrderAt = iso(r.last_order);
 existing.name = existing.name || r.name || null;
 existing.phone = existing.phone || r.phone || null;
 existing.location = existing.location || location;
 } else {
 map.set(email, { email, name: r.name ?? null, phone: r.phone ?? null, location, subscribed: true, source: "buyer", orders: r.orders, spentCents: r.spent_cents, lastOrderAt: iso(r.last_order), addedAt: null, tags: [], notes: null });
 }
 }

 const ts = (c: CustomerProfile) => c.lastOrderAt || c.addedAt || "";
 return [...map.values()].sort((a, b) => b.spentCents - a.spentCents || ts(b).localeCompare(ts(a)));
}

/**
 * The real email audience: the UNIFIED customer list (imported + anyone who bought), deduped by
 * email and limited to those who are subscribed and have a valid address. This — not the raw
 * imported table — is who a campaign actually reaches, so campaigns count and send consistently.
 */
export async function listSubscribers(storeSlug: string): Promise<{ email: string; name: string | null }[]> {
 const profiles = await listCustomerProfiles(storeSlug);
 const seen = new Set<string>();
 const out: { email: string; name: string | null }[] = [];
 for (const p of profiles) {
 const e = (p.email || "").toLowerCase().trim();
 if (!p.subscribed || !e.includes("@") || seen.has(e)) continue;
 seen.add(e);
 out.push({ email: p.email, name: p.name });
 }
 return out;
}

/** A transparent breakdown of the audience so the count is verifiable, not a mystery number. */
export async function getAudienceBreakdown(storeSlug: string): Promise<{ subscribers: number; unsubscribed: number; buyers: number; imported: number; total: number }> {
 const profiles = await listCustomerProfiles(storeSlug);
 let subscribers = 0, unsubscribed = 0, buyers = 0, imported = 0;
 for (const p of profiles) {
 if (p.subscribed) subscribers++; else unsubscribed++;
 if (p.source === "buyer" || p.source === "both") buyers++;
 if (p.source === "imported" || p.source === "both") imported++;
 }
 return { subscribers, unsubscribed, buyers, imported, total: profiles.length };
}

/** Add a single customer by hand (the "Add customer" button). Upsert-safe. */
export async function addCustomer(storeSlug: string, email: string, name: string | null): Promise<void> {
 await importCustomers(storeSlug, [{ email, name, phone: null }], "manual");
}

/** Flip a customer's marketing-email consent for THIS store only (used by /unsubscribe).
 *  Upserts so an unsubscribe still records even if the recipient isn't a stored customer yet. */
export async function setEmailSubscribed(storeSlug: string, email: string, subscribed: boolean): Promise<void> {
 await ensureTable();
 const sql = db();
 await sql`
 INSERT INTO store_customers (store_slug, email, email_subscribed, source)
 VALUES (${storeSlug}, ${email.toLowerCase().trim()}, ${subscribed}, 'unsubscribe')
 ON CONFLICT (store_slug, email) DO UPDATE SET email_subscribed = ${subscribed}
 `.catch(() => {});
 // If the store sends from Klaviyo or Mailchimp, tell it too. An unsubscribe that VYA honours and
 // their other tool doesn't is the worst outcome here: the person keeps getting emails and the
 // store looks like it ignored them.
 const { mirrorToEsp } = await import("./esp-mirror");
 mirrorToEsp(storeSlug, { email: email.toLowerCase().trim(), subscribed });
}

// ── CRM: tags (segments) + a private note per contact ──────────────────────────
// A contact might only exist as a buyer (orders, no store_customers row yet), so every
// mutation upserts the row first, keyed by (store_slug, email).
async function ensureCustomerRow(storeSlug: string, email: string): Promise<string> {
 await ensureTable();
 const e = email.toLowerCase().trim();
 await db()`
 INSERT INTO store_customers (store_slug, email, source)
 VALUES (${storeSlug}, ${e}, 'crm')
 ON CONFLICT (store_slug, email) DO NOTHING
 `.catch(() => {});
 return e;
}

/** Replace a contact's full tag set. */
export async function setCustomerTags(storeSlug: string, email: string, tags: string[]): Promise<void> {
 const e = await ensureCustomerRow(storeSlug, email);
 const clean = Array.from(new Set(tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))).slice(0, 40);
 await db()`UPDATE store_customers SET tags = ${clean} WHERE store_slug = ${storeSlug} AND email = ${e}`;
}

/** Add one tag (no-op if already present). */
export async function addCustomerTag(storeSlug: string, email: string, tag: string): Promise<void> {
 const e = await ensureCustomerRow(storeSlug, email);
 const t = String(tag).trim().toLowerCase();
 if (!t) return;
 await db()`UPDATE store_customers SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(array_append(tags, ${t})))) WHERE store_slug = ${storeSlug} AND email = ${e}`;
}

/** Remove one tag. */
export async function removeCustomerTag(storeSlug: string, email: string, tag: string): Promise<void> {
 const e = email.toLowerCase().trim();
 const t = String(tag).trim().toLowerCase();
 await ensureTable();
 await db()`UPDATE store_customers SET tags = array_remove(tags, ${t}) WHERE store_slug = ${storeSlug} AND email = ${e}`;
}

/** Set (or clear with null) a contact's private note. */
export async function setCustomerNote(storeSlug: string, email: string, note: string | null): Promise<void> {
 const e = await ensureCustomerRow(storeSlug, email);
 await db()`UPDATE store_customers SET notes = ${note && note.trim() ? note.trim().slice(0, 2000) : null} WHERE store_slug = ${storeSlug} AND email = ${e}`;
}

/** Every distinct tag in use for this store, with how many contacts carry it — the segment list. */
export async function listCustomerTags(storeSlug: string): Promise<{ tag: string; count: number }[]> {
 await ensureTable();
 const rows = (await db()`
 SELECT tag, count(*)::int AS count
 FROM store_customers, unnest(tags) AS tag
 WHERE store_slug = ${storeSlug}
 GROUP BY tag ORDER BY count DESC, tag ASC
 `.catch(() => [])) as any[];
 return rows.map((r) => ({ tag: r.tag, count: r.count }));
}

/**
 * Every store this email holds a customer record at.
 *
 * FOR VYA ONLY. A seller must never see this. Showing Scottie that her buyer also shops at four
 * other vintage stores hands her a competitor list assembled from other sellers' customers — the
 * same rule the Data Layer runs on, where a seller sees market-level signal and never another
 * store's individual numbers. Every caller must be an admin route or an internal job.
 *
 * Useful because it is exactly the marketplace-conversion signal: someone who is a customer of five
 * of our stores and has never signed in to VYA is the best person there is to invite.
 *
 * An email is a strong hint at one person, not proof of it — households share addresses, people use
 * different emails at different shops. Good enough to greet someone by name or to spot a good
 * invitation; never good enough to merge order histories or show one seller's data on another's page.
 */
export async function listStoresForShopper(email: string): Promise<{ storeSlug: string; since: Date | null }[]> {
 const e = (email || "").trim().toLowerCase();
 if (!e) return [];
 const rows = await db()`SELECT store_slug, min(created_at) AS since FROM store_customers
  WHERE lower(email) = ${e} GROUP BY store_slug ORDER BY min(created_at)` as { store_slug: string; since: Date | null }[];
 return rows.map((r) => ({ storeSlug: r.store_slug, since: r.since }));
}

/**
 * Record that this person signed in on this seller's store, and return whether they are new here.
 *
 * `email_subscribed` is deliberately NOT set: signing in is not agreeing to be emailed marketing.
 * The seller can ask for that separately, and the shopper can say yes to it.
 */
export async function upsertShopper(storeSlug: string, email: string, name: string | null): Promise<{ isNew: boolean }> {
 const e = (email || "").trim().toLowerCase();
 if (!e) return { isNew: false };
 const existing = await db()`SELECT 1 FROM store_customers WHERE store_slug = ${storeSlug} AND lower(email) = ${e} LIMIT 1`;
 if (existing.length) {
  if (name) await db()`UPDATE store_customers SET name = COALESCE(name, ${name}) WHERE store_slug = ${storeSlug} AND lower(email) = ${e}`;
  return { isNew: false };
 }
 await db()`INSERT INTO store_customers (store_slug, email, name, source, email_subscribed)
  VALUES (${storeSlug}, ${e}, ${name}, ${"signed_in"}, false)
  ON CONFLICT DO NOTHING`;
 return { isNew: true };
}
