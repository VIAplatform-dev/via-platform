import { neon } from "@neondatabase/serverless";

// Open carts at a market: one per customer being served. A seller juggling three people at a stall
// keeps three carts going and pays them off one at a time. Carts live on the server (not the phone)
// so they survive a closed tab and show up on every device the seller has open.
//
// Lines are stored as JSONB — the same shape the Confirm/Cart screens already pass around. The
// server re-validates every line when the checkout actually starts, so this is a scratchpad, never
// a source of truth for price or availability.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

let ensured = false;
export async function ensureMarketCartTables(): Promise<void> {
 if (ensured) return;
 const s = db();
 await s`CREATE TABLE IF NOT EXISTS market_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL,
  session_id UUID NOT NULL,
  number INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await s`CREATE INDEX IF NOT EXISTS market_carts_open ON market_carts (seller_id, session_id, status)`;
 ensured = true;
}

export type StoredCartLine = { itemId: string; title: string; image: string | null; size: string | null; listCents: number; saleCents: number; discount: unknown };
export type MarketCart = { id: string; number: number; status: string; lines: StoredCartLine[]; createdAt: string; updatedAt: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
function row(r: any): MarketCart {
 const raw = typeof r.lines === "string" ? JSON.parse(r.lines) : r.lines;
 return {
 id: String(r.id),
 number: Number(r.number),
 status: String(r.status),
 lines: Array.isArray(raw) ? (raw as StoredCartLine[]) : [],
 createdAt: new Date(r.created_at).toISOString(),
 updatedAt: new Date(r.updated_at).toISOString(),
 };
}

/** Every cart still being built for this session, oldest first so Cart 1 stays leftmost. */
export async function listOpenCarts(sellerId: string, sessionId: string): Promise<MarketCart[]> {
 await ensureMarketCartTables();
 const rows = await db()`SELECT * FROM market_carts
  WHERE seller_id = ${sellerId} AND session_id = ${sessionId} AND status = 'open'
  ORDER BY number ASC`;
 return rows.map(row);
}

export async function getCart(sellerId: string, id: string): Promise<MarketCart | null> {
 await ensureMarketCartTables();
 const rows = await db()`SELECT * FROM market_carts WHERE id = ${id} AND seller_id = ${sellerId} LIMIT 1`;
 return rows[0] ? row(rows[0]) : null;
}

/** Next cart, numbered after the highest this session has seen — numbers never get reused, so
 *  "Cart 3" means the same cart all afternoon even after Cart 1 and 2 have been paid off. */
export async function createCart(sellerId: string, sessionId: string): Promise<MarketCart> {
 await ensureMarketCartTables();
 const s = db();
 const [max] = (await s`SELECT coalesce(max(number), 0)::int AS n FROM market_carts WHERE seller_id = ${sellerId} AND session_id = ${sessionId}`) as Array<{ n: number }>;
 const next = (max?.n ?? 0) + 1;
 const rows = await s`INSERT INTO market_carts (seller_id, session_id, number) VALUES (${sellerId}, ${sessionId}, ${next}) RETURNING *`;
 return row(rows[0]);
}

export async function saveCartLines(sellerId: string, id: string, lines: StoredCartLine[]): Promise<MarketCart | null> {
 await ensureMarketCartTables();
 const rows = await db()`UPDATE market_carts SET lines = ${JSON.stringify(lines)}::jsonb, updated_at = now()
  WHERE id = ${id} AND seller_id = ${sellerId} AND status = 'open' RETURNING *`;
 return rows[0] ? row(rows[0]) : null;
}

/** Closing a cart is soft: 'paid' once its checkout completes, 'dropped' if the seller clears it. */
export async function closeCart(sellerId: string, id: string, status: "paid" | "dropped"): Promise<void> {
 await ensureMarketCartTables();
 await db()`UPDATE market_carts SET status = ${status}, updated_at = now() WHERE id = ${id} AND seller_id = ${sellerId}`;
}
