import { neon } from "@neondatabase/serverless";
import { randomUUID } from "crypto";

// Consumer price offers on a store's pieces — the Depop/Poshmark negotiation. A buyer offers a
// price; the store accepts / declines / counters; either side can counter back until someone
// accepts (or it expires). Every move is logged so both sides see the full back-and-forth.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

export type OfferStatus = "pending" | "accepted" | "declined" | "expired" | "withdrawn";
export type OfferActor = "buyer" | "store";
export type OfferEvent = { actor: OfferActor; action: string; amountCents: number | null; createdAt: string };
export type Offer = {
 id: number;
 storeSlug: string;
 itemId: string | null;
 itemTitle: string | null;
 buyerName: string | null;
 buyerEmail: string | null;
 token: string;
 listPriceCents: number;
 amountCents: number; // the current offer on the table
 status: OfferStatus;
 lastActor: OfferActor; // whose move it was — the other side responds
 binding: boolean;
 consumedAt: string | null; // set once a binding offer has been redeemed at checkout (single-use)
 consumedOrderId: string | null;
 createdAt: string;
 updatedAt: string;
 expiresAt: string;
};

let ensured = false;
async function ensure() {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS storefront_offers (
 id SERIAL PRIMARY KEY,
 store_slug TEXT NOT NULL,
 item_id TEXT,
 item_title TEXT,
 buyer_name TEXT,
 buyer_email TEXT,
 token TEXT NOT NULL UNIQUE,
 list_price_cents INTEGER NOT NULL,
 amount_cents INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 last_actor TEXT NOT NULL DEFAULT 'buyer',
 binding BOOLEAN NOT NULL DEFAULT false,
 consumed_at TIMESTAMPTZ,
 consumed_order_id TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 days')
 )`;
 // Self-healing: existing tables predate the single-use redemption columns.
 await sql`ALTER TABLE storefront_offers ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ`;
 await sql`ALTER TABLE storefront_offers ADD COLUMN IF NOT EXISTS consumed_order_id TEXT`;
 await sql`CREATE TABLE IF NOT EXISTS storefront_offer_events (
 id SERIAL PRIMARY KEY,
 offer_id INTEGER NOT NULL REFERENCES storefront_offers(id) ON DELETE CASCADE,
 actor TEXT NOT NULL,
 action TEXT NOT NULL,
 amount_cents INTEGER,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_offers_store ON storefront_offers (store_slug, updated_at DESC)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_offer_events ON storefront_offer_events (offer_id, created_at)`;
 ensured = true;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// A pending offer past its expiry reads as expired, without needing a cron.
function effectiveStatus(r: any): OfferStatus {
 const s = r.status as OfferStatus;
 if (s === "pending" && r.expires_at && new Date(r.expires_at).getTime() < Date.now()) return "expired";
 return s;
}

function mapOffer(r: any): Offer {
 return {
 id: r.id,
 storeSlug: r.store_slug,
 itemId: r.item_id ?? null,
 itemTitle: r.item_title ?? null,
 buyerName: r.buyer_name ?? null,
 buyerEmail: r.buyer_email ?? null,
 token: r.token,
 listPriceCents: Number(r.list_price_cents),
 amountCents: Number(r.amount_cents),
 status: effectiveStatus(r),
 lastActor: (r.last_actor as OfferActor) || "buyer",
 binding: !!r.binding,
 consumedAt: r.consumed_at ?? null,
 consumedOrderId: r.consumed_order_id ?? null,
 createdAt: r.created_at,
 updatedAt: r.updated_at,
 expiresAt: r.expires_at,
 };
}

export async function createOffer(input: {
 storeSlug: string; itemId?: string | null; itemTitle?: string | null;
 buyerName?: string | null; buyerEmail?: string | null;
 listPriceCents: number; amountCents: number; binding: boolean;
}): Promise<Offer> {
 await ensure();
 const sql = db();
 const token = randomUUID();
 const rows = await sql`INSERT INTO storefront_offers
 (store_slug, item_id, item_title, buyer_name, buyer_email, token, list_price_cents, amount_cents, last_actor, binding)
 VALUES (${input.storeSlug}, ${input.itemId ?? null}, ${input.itemTitle ?? null}, ${input.buyerName ?? null},
 ${input.buyerEmail ?? null}, ${token}, ${input.listPriceCents}, ${input.amountCents}, 'buyer', ${input.binding})
 RETURNING *`;
 const offer = mapOffer(rows[0]);
 await sql`INSERT INTO storefront_offer_events (offer_id, actor, action, amount_cents) VALUES (${offer.id}, 'buyer', 'offer', ${input.amountCents})`;
 return offer;
}

export async function getOfferByToken(token: string): Promise<Offer | null> {
 await ensure();
 const rows = (await db()`SELECT * FROM storefront_offers WHERE token = ${token} LIMIT 1`.catch(() => [])) as any[];
 return rows.length ? mapOffer(rows[0]) : null;
}

/**
 * Return the offer ONLY if it can be redeemed at checkout for `itemId`: it was accepted, it's a
 * binding offer (the store promised the agreed price), it's for this exact piece, and it hasn't
 * already been used. Anything else (pending/declined, non-binding, wrong item, already purchased)
 * returns null, so the checkout falls back to rejecting rather than charging the wrong price.
 */
export async function getRedeemableBindingOffer(token: string, itemId: string): Promise<Offer | null> {
 const o = await getOfferByToken(token);
 if (!o) return null;
 if (o.status !== "accepted" || !o.binding) return null;
 if (!o.itemId || o.itemId !== itemId) return null;
 if (o.consumedAt) return null;
 return o;
}

/** Mark a binding offer as redeemed (single-use). Idempotent — only the first order wins. */
export async function markOfferConsumed(token: string, orderId: string): Promise<void> {
 await ensure();
 await db()`UPDATE storefront_offers SET consumed_at = now(), consumed_order_id = ${orderId}, updated_at = now()
 WHERE token = ${token} AND consumed_at IS NULL`.catch(() => {});
}

export async function getOfferForStore(id: number, storeSlug: string): Promise<Offer | null> {
 await ensure();
 const rows = (await db()`SELECT * FROM storefront_offers WHERE id = ${id} AND store_slug = ${storeSlug} LIMIT 1`.catch(() => [])) as any[];
 return rows.length ? mapOffer(rows[0]) : null;
}

export async function listOffersByStore(storeSlug: string): Promise<Offer[]> {
 await ensure();
 const rows = (await db()`SELECT * FROM storefront_offers WHERE store_slug = ${storeSlug} ORDER BY updated_at DESC LIMIT 200`.catch(() => [])) as any[];
 return rows.map(mapOffer);
}

export async function getOfferEvents(offerId: number): Promise<OfferEvent[]> {
 await ensure();
 const rows = (await db()`SELECT actor, action, amount_cents, created_at FROM storefront_offer_events WHERE offer_id = ${offerId} ORDER BY created_at`.catch(() => [])) as any[];
 return rows.map((r) => ({ actor: r.actor as OfferActor, action: String(r.action), amountCents: r.amount_cents == null ? null : Number(r.amount_cents), createdAt: r.created_at }));
}

export async function countPendingForStore(storeSlug: string): Promise<number> {
 await ensure();
 // Pending + it's the buyer's move waiting on the store (store's turn to respond), not expired.
 const rows = (await db()`SELECT COUNT(*)::int AS n FROM storefront_offers
 WHERE store_slug = ${storeSlug} AND status = 'pending' AND last_actor = 'buyer' AND expires_at > now()`.catch(() => [])) as any[];
 return Number(rows[0]?.n || 0);
}

// The state machine. `actor` is who's acting; you can only respond when it's the OTHER side's
// move on the table. Returns the updated offer, or null if the move isn't allowed.
export async function respondToOffer(
 offer: Offer,
 actor: OfferActor,
 action: "accept" | "decline" | "counter" | "withdraw",
 amountCents?: number,
): Promise<Offer | null> {
 await ensure();
 const sql = db();
 if (offer.status !== "pending" || new Date(offer.expiresAt).getTime() < Date.now()) return null; // only live offers
 if (action === "withdraw") {
 if (actor !== "buyer") return null;
 } else if (offer.lastActor === actor) {
 return null; // can't act on your own move (except withdraw)
 }

 let status: OfferStatus = offer.status;
 let amount = offer.amountCents;
 let lastActor: OfferActor = offer.lastActor;
 if (action === "accept") status = "accepted";
 else if (action === "decline") status = "declined";
 else if (action === "withdraw") status = "withdrawn";
 else if (action === "counter") {
 if (!amountCents || amountCents <= 0) return null;
 amount = Math.round(amountCents);
 lastActor = actor; // your counter is now the move on the table
 }

 const rows = await sql`UPDATE storefront_offers
 SET status = ${status}, amount_cents = ${amount}, last_actor = ${lastActor}, updated_at = now()
 WHERE id = ${offer.id} RETURNING *`;
 await sql`INSERT INTO storefront_offer_events (offer_id, actor, action, amount_cents) VALUES (${offer.id}, ${actor}, ${action}, ${action === "counter" ? amount : null})`;
 return mapOffer(rows[0]);
}
