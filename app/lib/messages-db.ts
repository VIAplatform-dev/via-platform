import { neon } from "@neondatabase/serverless";

// ───────────────────────────────────────────────────────────────────────────
// Customer ↔ Store messaging. A customer asks a question about a product; that
// opens one conversation per (customer, product). The store replies from the
// web portal or the in-app store dashboard. Unread counters are per-side so each
// party only sees a badge for messages the OTHER party sent.
// ───────────────────────────────────────────────────────────────────────────

function getSql() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return neon(url);
}

export type MessageSender = "customer" | "store";

export type Conversation = {
 id: number;
 customerUserId: string;
 storeSlug: string;
 productId: number | null;
 productTitle: string | null;
 productImage: string | null;
 createdAt: string;
 lastMessageAt: string;
 lastSender: MessageSender | null;
 customerUnread: number;
 storeUnread: number;
};

export type Message = {
 id: number;
 conversationId: number;
 sender: MessageSender;
 body: string;
 createdAt: string;
 readAt: string | null;
};

let _initialized = false;

export async function ensureMessagingTables() {
 if (_initialized) return;
 const sql = getSql();
 await sql`
 CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  customer_user_id TEXT NOT NULL,
  store_slug TEXT NOT NULL,
  product_id INTEGER,
  product_title TEXT,
  product_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sender TEXT,
  customer_unread INT NOT NULL DEFAULT 0,
  store_unread INT NOT NULL DEFAULT 0,
  UNIQUE (customer_user_id, product_id)
 )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_user_id)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_conversations_store ON conversations(store_slug, last_message_at DESC)`;

 await sql`
 CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
 )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at)`;

 await sql`
 CREATE TABLE IF NOT EXISTS store_push_tokens (
  store_slug TEXT NOT NULL,
  token TEXT NOT NULL,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (store_slug, token)
 )
 `;
 await sql`CREATE INDEX IF NOT EXISTS idx_store_push_tokens_store ON store_push_tokens(store_slug)`;
 _initialized = true;
}

function mapConversation(r: Record<string, unknown>): Conversation {
 const iso = (v: unknown) => (v as Date)?.toISOString?.() ?? String(v);
 return {
 id: Number(r.id),
 customerUserId: String(r.customer_user_id),
 storeSlug: String(r.store_slug),
 productId: r.product_id == null ? null : Number(r.product_id),
 productTitle: r.product_title == null ? null : String(r.product_title),
 productImage: r.product_image == null ? null : String(r.product_image),
 createdAt: iso(r.created_at),
 lastMessageAt: iso(r.last_message_at),
 lastSender: (r.last_sender as MessageSender) ?? null,
 customerUnread: Number(r.customer_unread ?? 0),
 storeUnread: Number(r.store_unread ?? 0),
 };
}

function mapMessage(r: Record<string, unknown>): Message {
 const iso = (v: unknown) => (v as Date)?.toISOString?.() ?? String(v);
 return {
 id: Number(r.id),
 conversationId: Number(r.conversation_id),
 sender: r.sender as MessageSender,
 body: String(r.body),
 createdAt: iso(r.created_at),
 readAt: r.read_at == null ? null : iso(r.read_at),
 };
}

/** Find the existing (customer, product) thread or create a new one. */
export async function getOrCreateConversation(params: {
 customerUserId: string;
 storeSlug: string;
 productId: number | null;
 productTitle: string | null;
 productImage: string | null;
}): Promise<Conversation> {
 await ensureMessagingTables();
 const sql = getSql();
 // One thread per (customer, product). ON CONFLICT keeps the original row but
 // refreshes the product snapshot in case title/image changed.
 const rows = (await sql`
 INSERT INTO conversations (customer_user_id, store_slug, product_id, product_title, product_image)
 VALUES (${params.customerUserId}, ${params.storeSlug}, ${params.productId}, ${params.productTitle}, ${params.productImage})
 ON CONFLICT (customer_user_id, product_id)
 DO UPDATE SET product_title = EXCLUDED.product_title, product_image = EXCLUDED.product_image
 RETURNING *
 `) as Array<Record<string, unknown>>;
 return mapConversation(rows[0]);
}

/** Insert a message and bump the conversation: last_message_at, last_sender,
 * and the recipient's unread counter. Returns the new message. */
export async function postMessage(
 conversationId: number,
 sender: MessageSender,
 body: string,
): Promise<Message> {
 await ensureMessagingTables();
 const sql = getSql();
 const rows = (await sql`
 INSERT INTO messages (conversation_id, sender, body)
 VALUES (${conversationId}, ${sender}, ${body})
 RETURNING *
 `) as Array<Record<string, unknown>>;

 if (sender === "customer") {
 await sql`
 UPDATE conversations
 SET last_message_at = NOW(), last_sender = 'customer', store_unread = store_unread + 1
 WHERE id = ${conversationId}
 `;
 } else {
 await sql`
 UPDATE conversations
 SET last_message_at = NOW(), last_sender = 'store', customer_unread = customer_unread + 1
 WHERE id = ${conversationId}
 `;
 }
 return mapMessage(rows[0]);
}

export async function getConversation(id: number): Promise<Conversation | null> {
 await ensureMessagingTables();
 const sql = getSql();
 const rows = (await sql`SELECT * FROM conversations WHERE id = ${id} LIMIT 1`) as Array<Record<string, unknown>>;
 return rows[0] ? mapConversation(rows[0]) : null;
}

export async function listCustomerConversations(customerUserId: string): Promise<Conversation[]> {
 await ensureMessagingTables();
 const sql = getSql();
 const rows = (await sql`
 SELECT * FROM conversations WHERE customer_user_id = ${customerUserId} ORDER BY last_message_at DESC
 `) as Array<Record<string, unknown>>;
 return rows.map(mapConversation);
}

export async function listStoreConversations(storeSlug: string): Promise<Conversation[]> {
 await ensureMessagingTables();
 const sql = getSql();
 const rows = (await sql`
 SELECT * FROM conversations WHERE store_slug = ${storeSlug} ORDER BY last_message_at DESC
 `) as Array<Record<string, unknown>>;
 return rows.map(mapConversation);
}

export async function getMessages(conversationId: number): Promise<Message[]> {
 await ensureMessagingTables();
 const sql = getSql();
 const rows = (await sql`
 SELECT * FROM messages WHERE conversation_id = ${conversationId} ORDER BY created_at ASC
 `) as Array<Record<string, unknown>>;
 return rows.map(mapMessage);
}

/** Clear the customer's unread badge and mark store messages as read. */
export async function markReadByCustomer(conversationId: number): Promise<void> {
 await ensureMessagingTables();
 const sql = getSql();
 await sql`UPDATE conversations SET customer_unread = 0 WHERE id = ${conversationId}`;
 await sql`UPDATE messages SET read_at = NOW() WHERE conversation_id = ${conversationId} AND sender = 'store' AND read_at IS NULL`;
}

/** Clear the store's unread badge and mark customer messages as read. */
export async function markReadByStore(conversationId: number): Promise<void> {
 await ensureMessagingTables();
 const sql = getSql();
 await sql`UPDATE conversations SET store_unread = 0 WHERE id = ${conversationId}`;
 await sql`UPDATE messages SET read_at = NOW() WHERE conversation_id = ${conversationId} AND sender = 'customer' AND read_at IS NULL`;
}

export async function registerStorePushToken(
 storeSlug: string,
 token: string,
 platform: string | null,
): Promise<void> {
 await ensureMessagingTables();
 const sql = getSql();
 await sql`
 INSERT INTO store_push_tokens (store_slug, token, platform)
 VALUES (${storeSlug}, ${token}, ${platform})
 ON CONFLICT (store_slug, token) DO NOTHING
 `;
}

export async function getStorePushTokens(storeSlug: string): Promise<string[]> {
 await ensureMessagingTables();
 const sql = getSql();
 const rows = (await sql`SELECT token FROM store_push_tokens WHERE store_slug = ${storeSlug}`) as Array<{ token: string }>;
 return rows.map((r) => r.token);
}

/** Marketplace (app) threads where the customer spoke last and has been waiting more than `hours`. */
export async function countUnansweredStoreConversations(storeSlug: string, hours = 24): Promise<number> {
 await ensureMessagingTables();
 const sql = getSql();
 const rows = (await sql`
 SELECT count(*)::int AS n FROM conversations
 WHERE store_slug = ${storeSlug} AND last_sender = 'customer' AND last_message_at < NOW() - (${hours} * interval '1 hour')
 `) as Array<{ n: number }>;
 return Number(rows[0]?.n ?? 0);
}

/** Total unread messages for a store across all conversations (portal badge). */
export async function getStoreUnreadTotal(storeSlug: string): Promise<number> {
 await ensureMessagingTables();
 const sql = getSql();
 const rows = (await sql`
 SELECT COALESCE(SUM(store_unread), 0)::int AS total FROM conversations WHERE store_slug = ${storeSlug}
 `) as Array<{ total: number }>;
 return Number(rows[0]?.total ?? 0);
}
