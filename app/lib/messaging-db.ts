import { neon } from "@neondatabase/serverless";
import { randomUUID } from "crypto";

// ───────────────────────────────────────────────────────────────────────────
// Buyer ⇄ store messaging. A buyer asks about an item (or the store generally);
// it opens a conversation the seller answers from their portal inbox. The buyer
// follows the thread via a private token link (no account needed).
// ───────────────────────────────────────────────────────────────────────────

function getDatabaseUrl() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL environment variable is not set.");
 return url;
}

export type Sender = "buyer" | "store";
export type Message = { id: number; conversationId: number; sender: Sender; body: string; createdAt: string };
export type Conversation = {
 id: number;
 storeSlug: string;
 buyerName: string | null;
 buyerEmail: string | null;
 itemTitle: string | null;
 token: string;
 status: "open" | "closed";
 createdAt: string;
 lastMessageAt: string;
};
export type ConversationSummary = Conversation & { lastMessage: string | null; storeUnread: number };

let ensured = false;
async function ensureTables() {
 if (ensured) return;
 const sql = neon(getDatabaseUrl());
 await sql`CREATE TABLE IF NOT EXISTS storefront_conversations (
 id SERIAL PRIMARY KEY,
 store_slug TEXT NOT NULL,
 buyer_name TEXT,
 buyer_email TEXT,
 item_title TEXT,
 token TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'open',
 store_read_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`CREATE TABLE IF NOT EXISTS storefront_messages (
 id SERIAL PRIMARY KEY,
 conversation_id INTEGER NOT NULL REFERENCES storefront_conversations(id) ON DELETE CASCADE,
 sender TEXT NOT NULL,
 body TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_conv_store ON storefront_conversations (store_slug, last_message_at DESC)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_msg_conv ON storefront_messages (conversation_id, created_at)`;
 ensured = true;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapConv(r: any): Conversation {
 return {
 id: r.id,
 storeSlug: r.store_slug,
 buyerName: r.buyer_name ?? null,
 buyerEmail: r.buyer_email ?? null,
 itemTitle: r.item_title ?? null,
 token: r.token,
 status: (r.status as "open" | "closed") || "open",
 createdAt: r.created_at,
 lastMessageAt: r.last_message_at,
 };
}

/** Open a conversation with the buyer's first message. Returns the thread token. */
export async function createConversation(
 storeSlug: string,
 input: { name?: string | null; email?: string | null; itemTitle?: string | null; message: string },
): Promise<{ id: number; token: string }> {
 await ensureTables();
 const sql = neon(getDatabaseUrl());
 const token = randomUUID();
 const rows = await sql`INSERT INTO storefront_conversations (store_slug, buyer_name, buyer_email, item_title, token)
 VALUES (${storeSlug}, ${input.name ?? null}, ${input.email ?? null}, ${input.itemTitle ?? null}, ${token})
 RETURNING id`;
 const id = rows[0].id as number;
 await sql`INSERT INTO storefront_messages (conversation_id, sender, body) VALUES (${id}, 'buyer', ${input.message})`;
 return { id, token };
}

/** Append a message and bump the conversation. */
export async function addMessage(conversationId: number, sender: Sender, body: string): Promise<void> {
 await ensureTables();
 const sql = neon(getDatabaseUrl());
 await sql`INSERT INTO storefront_messages (conversation_id, sender, body) VALUES (${conversationId}, ${sender}, ${body})`;
 if (sender === "store") {
 await sql`UPDATE storefront_conversations SET last_message_at = now(), store_read_at = now() WHERE id = ${conversationId}`;
 } else {
 await sql`UPDATE storefront_conversations SET last_message_at = now() WHERE id = ${conversationId}`;
 }
}

export async function getConversationByToken(token: string): Promise<Conversation | null> {
 await ensureTables();
 const sql = neon(getDatabaseUrl());
 const rows = await sql`SELECT * FROM storefront_conversations WHERE token = ${token}`;
 return rows.length ? mapConv(rows[0]) : null;
}

export async function getConversationForStore(id: number, storeSlug: string): Promise<Conversation | null> {
 await ensureTables();
 const sql = neon(getDatabaseUrl());
 const rows = await sql`SELECT * FROM storefront_conversations WHERE id = ${id} AND store_slug = ${storeSlug}`;
 return rows.length ? mapConv(rows[0]) : null;
}

export async function getMessages(conversationId: number): Promise<Message[]> {
 await ensureTables();
 const sql = neon(getDatabaseUrl());
 const rows = await sql`SELECT * FROM storefront_messages WHERE conversation_id = ${conversationId} ORDER BY created_at ASC`;
 return rows.map((r: any) => ({ id: r.id, conversationId: r.conversation_id, sender: r.sender as Sender, body: r.body, createdAt: r.created_at }));
}

/** Inbox list for the store, with the latest message preview + unread count. */
export async function getConversationsByStore(storeSlug: string): Promise<ConversationSummary[]> {
 await ensureTables();
 const sql = neon(getDatabaseUrl());
 const rows = await sql`
 SELECT c.*,
 (SELECT body FROM storefront_messages m WHERE m.conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
 (SELECT count(*) FROM storefront_messages m WHERE m.conversation_id = c.id AND m.sender = 'buyer'
 AND (c.store_read_at IS NULL OR m.created_at > c.store_read_at)) AS store_unread
 FROM storefront_conversations c
 WHERE c.store_slug = ${storeSlug}
 ORDER BY c.last_message_at DESC
 LIMIT 200`;
 return rows.map((r: any) => ({ ...mapConv(r), lastMessage: r.last_message ?? null, storeUnread: Number(r.store_unread) || 0 }));
}

/** Mark a store's view of a conversation as read. */
export async function markStoreRead(id: number, storeSlug: string): Promise<void> {
 await ensureTables();
 const sql = neon(getDatabaseUrl());
 await sql`UPDATE storefront_conversations SET store_read_at = now() WHERE id = ${id} AND store_slug = ${storeSlug}`;
}

/** All of a buyer's conversations with ONE store (by email). Store-scoped — a buyer of Store A
 *  is invisible to Store B; this only ever returns threads for (this store, this email). */
export async function getConversationsForBuyer(storeSlug: string, email: string): Promise<ConversationSummary[]> {
 await ensureTables();
 const sql = neon(getDatabaseUrl());
 const rows = await sql`
 SELECT c.*,
 (SELECT body FROM storefront_messages m WHERE m.conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message
 FROM storefront_conversations c
 WHERE c.store_slug = ${storeSlug} AND LOWER(c.buyer_email) = LOWER(${email})
 ORDER BY c.last_message_at DESC
 LIMIT 100`;
 return rows.map((r: any) => ({ ...mapConv(r), lastMessage: r.last_message ?? null, storeUnread: 0 }));
}

/** A single conversation scoped to (store, buyer email) — authorizes a buyer's reply. */
export async function getConversationForBuyer(id: number, storeSlug: string, email: string): Promise<Conversation | null> {
 await ensureTables();
 const sql = neon(getDatabaseUrl());
 const rows = await sql`SELECT * FROM storefront_conversations WHERE id = ${id} AND store_slug = ${storeSlug} AND LOWER(buyer_email) = LOWER(${email})`;
 return rows.length ? mapConv(rows[0]) : null;
}
