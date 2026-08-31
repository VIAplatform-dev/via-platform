import { neon } from "@neondatabase/serverless";
import { listSessionItemIds } from "./sessions-db";
import { ensureMarketOrderCols } from "@/app/lib/db/orders";

// What's "at this market": the seller's sellable items (active + quick-listed drafts), optionally
// narrowed to the session's bring list. Reads `items` directly — the single source of truth.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

export type MarketItem = {
 id: string; title: string; priceCents: number; currency: string; image: string | null;
 brand: string | null; size: string | null; category: string | null; status: string;
 soldAt: string | null; onBringList: boolean;
 // Present on getMarketItem (the Confirm / Edit screens); omitted from lists.
 images?: string[]; description?: string | null; era?: string | null; material?: string | null; condition?: string | null;
 costCents?: number | null; source?: string; soldForCents?: number | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function toItem(r: any, bring: Set<string> | null): MarketItem {
 const images = Array.isArray(r.images) ? r.images : [];
 return {
 id: String(r.id), title: String(r.title), priceCents: Number(r.price_cents) || 0, currency: String(r.currency || "USD"),
 image: images.length ? String(images[0]) : null, brand: r.brand ?? null, size: r.size ?? null, category: r.category ?? null,
 status: String(r.status), soldAt: r.sold_at ? new Date(r.sold_at).toISOString() : null,
 onBringList: bring ? bring.has(String(r.id)) : true,
 };
}

async function bringSet(sessionId: string | null): Promise<Set<string> | null> {
 if (!sessionId) return null;
 const ids = await listSessionItemIds(sessionId);
 return ids.length ? new Set(ids) : null; // empty list = "everything is here"
}

/** Sellable items, bring-list first. */
export async function listAvailableAtMarket(sellerId: string, sessionId: string | null): Promise<MarketItem[]> {
 const bring = await bringSet(sessionId);
 const rows = await db()`SELECT id, title, price_cents, currency, images, brand, size, category, status, sold_at FROM items
  WHERE seller_id = ${sellerId} AND status IN ('active','draft') ORDER BY created_at DESC LIMIT 2000`;
 const out = rows.map((r) => toItem(r, bring));
 return out.sort((a, b) => Number(b.onBringList) - Number(a.onBringList));
}

/** Items sold during this session (via market orders). */
export async function listSoldAtMarket(sellerId: string, sessionId: string): Promise<MarketItem[]> {
 await ensureMarketOrderCols();
 const rows = await db()`SELECT i.id, i.title, i.price_cents, i.currency, i.images, i.brand, i.size, i.category, i.status, i.sold_at
  FROM orders o JOIN items i ON i.id = o.item_id
  WHERE o.seller_id = ${sellerId} AND o.market_session_id = ${sessionId} AND o.status <> 'refunded'
  ORDER BY o.paid_at DESC NULLS LAST`;
 return rows.map((r) => toItem(r, null));
}

export type MarketCounts = { available: number; brought: number; broughtLeft: number; broughtValueCents: number; soldToday: number; grossTodayCents: number; cashCents: number; cardCents: number };

export async function countsAtMarket(sellerId: string, sessionId: string | null): Promise<MarketCounts> {
 await ensureMarketOrderCols();
 const [avail] = (await db()`SELECT count(*)::int AS n FROM items WHERE seller_id = ${sellerId} AND status IN ('active','draft')`) as Array<{ n: number }>;
 const out: MarketCounts = { available: avail?.n ?? 0, brought: 0, broughtLeft: 0, broughtValueCents: 0, soldToday: 0, grossTodayCents: 0, cashCents: 0, cardCents: 0 };
 if (!sessionId) return out;
 const ids = await listSessionItemIds(sessionId);
 out.brought = ids.length;
 if (ids.length) {
 const [b] = (await db()`SELECT count(*) FILTER (WHERE status IN ('active','draft'))::int AS left_n, coalesce(sum(price_cents) FILTER (WHERE status IN ('active','draft')),0)::int AS left_value FROM items WHERE id = ANY(${ids}::uuid[])`) as Array<{ left_n: number; left_value: number }>;
 out.broughtLeft = b?.left_n ?? 0; out.broughtValueCents = b?.left_value ?? 0;
 }
 const [s] = (await db()`SELECT count(*)::int AS n, coalesce(sum(amount_cents),0)::int AS gross,
  coalesce(sum(amount_cents) FILTER (WHERE tender = 'cash'),0)::int AS cash, coalesce(sum(amount_cents) FILTER (WHERE tender <> 'cash' OR tender IS NULL),0)::int AS card
  FROM orders WHERE seller_id = ${sellerId} AND market_session_id = ${sessionId} AND status <> 'refunded'`) as Array<{ n: number; gross: number; cash: number; card: number }>;
 out.soldToday = s?.n ?? 0; out.grossTodayCents = s?.gross ?? 0; out.cashCents = s?.cash ?? 0; out.cardCents = s?.card ?? 0;
 return out;
}

/** Bring list with the live status of each item (for the printout and the pack-up list). */
export async function listBringList(sellerId: string, sessionId: string): Promise<MarketItem[]> {
 const ids = await listSessionItemIds(sessionId);
 if (!ids.length) return listAvailableAtMarket(sellerId, null);
 const rows = await db()`SELECT id, title, price_cents, currency, images, brand, size, category, status, sold_at FROM items WHERE seller_id = ${sellerId} AND id = ANY(${ids}::uuid[]) ORDER BY title`;
 return rows.map((r) => toItem(r, new Set(ids)));
}

/** Fast manual search over the seller's own sellable items: title / brand / size / category / SKU-ish
 *  number. ILIKE + trigram-friendly; a few hundred rows per seller, so this is sub-100 ms. */
export async function searchMarketItems(sellerId: string, q: string, sessionId: string | null, limit = 12): Promise<MarketItem[]> {
 const term = q.trim();
 if (!term) return [];
 const bring = await bringSet(sessionId);
 const like = `%${term.replace(/[%_]/g, (m) => "\\" + m)}%`;
 const rows = await db()`SELECT id, title, price_cents, currency, images, brand, size, category, status, sold_at FROM items
  WHERE seller_id = ${sellerId} AND status IN ('active','draft','reserved','sold')
  AND (title ILIKE ${like} OR coalesce(brand,'') ILIKE ${like} OR coalesce(size,'') ILIKE ${like} OR coalesce(category,'') ILIKE ${like})
  ORDER BY CASE WHEN status IN ('active','draft') THEN 0 WHEN status = 'reserved' THEN 1 ELSE 2 END, created_at DESC
  LIMIT ${limit}`;
 return rows.map((r) => toItem(r, bring));
}

export async function getMarketItem(sellerId: string, itemId: string): Promise<MarketItem | null> {
 const rows = await db()`SELECT i.id, i.title, i.price_cents, i.currency, i.images, i.brand, i.size, i.category, i.status, i.sold_at, i.description, i.era, i.material, i.condition, i.cost_cents, i.source,
  (SELECT o.amount_cents FROM orders o WHERE o.item_id = i.id AND o.status <> 'refunded' ORDER BY o.paid_at DESC NULLS LAST LIMIT 1) AS sold_for
  FROM items i WHERE i.id = ${itemId} AND i.seller_id = ${sellerId} LIMIT 1`;
 if (!rows[0]) return null;
 const r = rows[0] as Record<string, unknown>;
 return { ...toItem(r, null), images: Array.isArray(r.images) ? (r.images as string[]) : [], description: (r.description as string) ?? null, era: (r.era as string) ?? null, material: (r.material as string) ?? null, condition: (r.condition as string) ?? null,
 costCents: r.cost_cents == null ? null : Number(r.cost_cents), source: (r.source as string) ?? "manual", soldForCents: r.sold_for == null ? null : Number(r.sold_for) };
}
