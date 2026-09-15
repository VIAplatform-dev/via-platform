import { neon } from "@neondatabase/serverless";

// Memory for the VYA Sidekick, per store:
//  • thread: the running conversation, so it survives refreshes/sessions.
//  • memory: durable facts the seller told it to remember (brand voice, preferences,
//               decisions), injected into the system prompt so it "remembers" across chats.
// Self-healing tables (created on first use), so there's no separate migration step.

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return neon(url);
}

let ready = false;
async function ensure(sql: ReturnType<typeof db>) {
 if (ready) return;
 await sql`CREATE TABLE IF NOT EXISTS assistant_threads (store_slug TEXT PRIMARY KEY, messages JSONB NOT NULL DEFAULT '[]'::jsonb, updated_at TIMESTAMPTZ DEFAULT now())`;
 await sql`CREATE TABLE IF NOT EXISTS assistant_memory (id BIGSERIAL PRIMARY KEY, store_slug TEXT NOT NULL, fact TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`;
 await sql`CREATE INDEX IF NOT EXISTS idx_assistant_memory_slug ON assistant_memory (store_slug, created_at)`;
 ready = true;
}

export type ThreadMessage = { role: "user" | "assistant"; content: string };

export async function loadThread(slug: string): Promise<ThreadMessage[]> {
 try {
 const sql = db(); await ensure(sql);
 const rows = (await sql`SELECT messages FROM assistant_threads WHERE store_slug = ${slug}`) as { messages: unknown }[];
 const m = rows[0]?.messages;
 return Array.isArray(m) ? (m as ThreadMessage[]) : [];
 } catch { return []; }
}

// Persist the visible thread (user turns + assistant replies, not the tool-call internals).
export async function saveThread(slug: string, messages: ThreadMessage[]): Promise<void> {
 try {
 const sql = db(); await ensure(sql);
 const trimmed = messages.slice(-120); // cap history so the row + context stay bounded
 await sql`
  INSERT INTO assistant_threads (store_slug, messages, updated_at)
  VALUES (${slug}, ${JSON.stringify(trimmed)}::jsonb, now())
  ON CONFLICT (store_slug) DO UPDATE SET messages = EXCLUDED.messages, updated_at = now()`;
 } catch { /* non-fatal: a persistence hiccup shouldn't break the reply */ }
}

export async function clearThread(slug: string): Promise<void> {
 try { const sql = db(); await ensure(sql); await sql`DELETE FROM assistant_threads WHERE store_slug = ${slug}`; } catch {}
}

export async function getMemories(slug: string): Promise<string[]> {
 try {
 const sql = db(); await ensure(sql);
 const rows = (await sql`SELECT fact FROM assistant_memory WHERE store_slug = ${slug} ORDER BY created_at ASC LIMIT 60`) as { fact: string }[];
 return rows.map((r) => r.fact);
 } catch { return []; }
}

export async function addMemory(slug: string, fact: string): Promise<boolean> {
 try {
 const sql = db(); await ensure(sql);
 const f = fact.trim().replace(/\s+/g, " ").slice(0, 500);
 if (f.length < 3) return false;
 const dupe = (await sql`SELECT 1 FROM assistant_memory WHERE store_slug = ${slug} AND lower(fact) = lower(${f}) LIMIT 1`) as unknown[];
 if (dupe.length) return false;
 await sql`INSERT INTO assistant_memory (store_slug, fact) VALUES (${slug}, ${f})`;
 return true;
 } catch { return false; }
}

// Delete memories matching a substring; returns how many were removed.
export async function forgetMemory(slug: string, match: string): Promise<number> {
 try {
 const sql = db(); await ensure(sql);
 const m = match.trim(); if (!m) return 0;
 const rows = (await sql`DELETE FROM assistant_memory WHERE store_slug = ${slug} AND fact ILIKE ${"%" + m + "%"} RETURNING id`) as unknown[];
 return rows.length;
 } catch { return 0; }
}
