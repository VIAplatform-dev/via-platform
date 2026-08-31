import { neon } from "@neondatabase/serverless";

// A market session = one day (or stint) at one physical market. Sales, "at this market" inventory
// and today's totals hang off the seller's single OPEN session. The "bring list" is optional: an
// empty list means "everything I have is here".

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

let ensured = false;
export async function ensureMarketSessionTables(): Promise<void> {
 if (ensured) return;
 const s = db();
 await s`CREATE TABLE IF NOT EXISTS market_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
 )`;
 await s`CREATE UNIQUE INDEX IF NOT EXISTS market_sessions_one_open ON market_sessions (seller_id) WHERE status = 'open'`;
 await s`CREATE TABLE IF NOT EXISTS market_session_items (
  session_id UUID NOT NULL,
  item_id UUID NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, item_id)
 )`;
 ensured = true;
}

export type MarketSession = { id: string; sellerId: string; name: string; status: "open" | "closed"; createdAt: string; closedAt: string | null };

/* eslint-disable @typescript-eslint/no-explicit-any */
function row(r: any): MarketSession {
 return { id: String(r.id), sellerId: String(r.seller_id), name: String(r.name), status: r.status === "closed" ? "closed" : "open", createdAt: new Date(r.created_at).toISOString(), closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null };
}

export async function getOpenSession(sellerId: string): Promise<MarketSession | null> {
 await ensureMarketSessionTables();
 const rows = await db()`SELECT * FROM market_sessions WHERE seller_id = ${sellerId} AND status = 'open' LIMIT 1`;
 return rows[0] ? row(rows[0]) : null;
}

/** The open session, creating "Today's market" if none exists. Safe under concurrency: the
 *  partial-unique index makes a racing insert fail, and we re-read the winner. */
export async function getOrOpenSession(sellerId: string, name?: string): Promise<MarketSession> {
 const existing = await getOpenSession(sellerId);
 if (existing) return existing;
 const label = (name || "").trim() || `Market · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
 try {
 const rows = await db()`INSERT INTO market_sessions (seller_id, name) VALUES (${sellerId}, ${label}) RETURNING *`;
 return row(rows[0]);
 } catch {
 const again = await getOpenSession(sellerId);
 if (again) return again;
 throw new Error("Could not open a market session");
 }
}

export async function getSession(sellerId: string, id: string): Promise<MarketSession | null> {
 await ensureMarketSessionTables();
 const rows = await db()`SELECT * FROM market_sessions WHERE id = ${id} AND seller_id = ${sellerId} LIMIT 1`;
 return rows[0] ? row(rows[0]) : null;
}

export async function renameSession(sessionId: string, sellerId: string, name: string): Promise<void> {
 await ensureMarketSessionTables();
 await db()`UPDATE market_sessions SET name = ${name.trim().slice(0, 80)} WHERE id = ${sessionId} AND seller_id = ${sellerId}`;
}

export async function closeSession(sessionId: string, sellerId: string): Promise<void> {
 await ensureMarketSessionTables();
 await db()`UPDATE market_sessions SET status = 'closed', closed_at = now() WHERE id = ${sessionId} AND seller_id = ${sellerId} AND status = 'open'`;
}

export async function listSessions(sellerId: string, limit = 20): Promise<MarketSession[]> {
 await ensureMarketSessionTables();
 const rows = await db()`SELECT * FROM market_sessions WHERE seller_id = ${sellerId} ORDER BY created_at DESC LIMIT ${limit}`;
 return rows.map(row);
}

// ── Bring list ──────────────────────────────────────────────────────────────────────────────
export async function listSessionItemIds(sessionId: string): Promise<string[]> {
 await ensureMarketSessionTables();
 const rows = (await db()`SELECT item_id FROM market_session_items WHERE session_id = ${sessionId}`) as Array<{ item_id: string }>;
 return rows.map((r) => String(r.item_id));
}

export async function addSessionItems(sessionId: string, itemIds: string[]): Promise<number> {
 await ensureMarketSessionTables();
 let n = 0;
 for (const id of itemIds) {
 const r = await db()`INSERT INTO market_session_items (session_id, item_id) VALUES (${sessionId}, ${id}) ON CONFLICT DO NOTHING RETURNING item_id`;
 n += r.length;
 }
 return n;
}

export async function removeSessionItems(sessionId: string, itemIds: string[]): Promise<void> {
 await ensureMarketSessionTables();
 if (!itemIds.length) return;
 await db()`DELETE FROM market_session_items WHERE session_id = ${sessionId} AND item_id = ANY(${itemIds}::uuid[])`;
}
