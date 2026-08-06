import { neon } from "@neondatabase/serverless";
import { sendStoreCampaign, getStoreEmailBrand } from "./email";
import { resolveStoreSender } from "./email-settings-db";
import { listSubscribers, listCustomerProfiles } from "./store-customers-db";

// Campaign history + scheduling. Sends used to be fire-and-forget (no record); this
// table gives every store a sent-log AND a way to schedule a send for later, which a
// cron flips live. One row per campaign.
function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
 return neon(url);
}

export type CampaignStatus = "scheduled" | "sending" | "sent" | "failed" | "canceled";
export type Campaign = {
 id: number;
 subject: string;
 body: string;
 link: string | null;
 segment: string | null;
 status: CampaignStatus;
 scheduledAt: string | null;
 sentAt: string | null;
 recipientCount: number;
 createdAt: string;
};

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 const sql = db();
 await sql`CREATE TABLE IF NOT EXISTS store_campaigns (
 id SERIAL PRIMARY KEY,
 store_slug TEXT NOT NULL,
 subject TEXT NOT NULL,
 body TEXT NOT NULL,
 link TEXT,
 segment TEXT,
 status TEXT NOT NULL DEFAULT 'sent',
 scheduled_at TIMESTAMPTZ,
 sent_at TIMESTAMPTZ,
 recipient_count INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 await sql`CREATE INDEX IF NOT EXISTS idx_store_campaigns_store ON store_campaigns (store_slug, created_at DESC)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_store_campaigns_due ON store_campaigns (status, scheduled_at)`;
 ensured = true;
}

function mapRow(r: any): Campaign {
 return {
 id: r.id,
 subject: r.subject,
 body: r.body,
 link: r.link ?? null,
 segment: r.segment ?? null,
 status: r.status,
 scheduledAt: r.scheduled_at ? new Date(r.scheduled_at).toISOString() : null,
 sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
 recipientCount: r.recipient_count ?? 0,
 createdAt: r.created_at ? new Date(r.created_at).toISOString() : "",
 };
}

/** Recent campaigns for a store — scheduled (upcoming) and sent (history), newest first. */
export async function listCampaigns(storeSlug: string, limit = 30): Promise<Campaign[]> {
 await ensureTable();
 const rows = (await db()`
 SELECT * FROM store_campaigns WHERE store_slug = ${storeSlug}
 ORDER BY COALESCE(scheduled_at, sent_at, created_at) DESC LIMIT ${limit}
 `.catch(() => [])) as any[];
 return rows.map(mapRow);
}

export async function getCampaign(storeSlug: string, id: number): Promise<Campaign | null> {
 await ensureTable();
 const rows = (await db()`SELECT * FROM store_campaigns WHERE store_slug = ${storeSlug} AND id = ${id} LIMIT 1`.catch(() => [])) as any[];
 return rows[0] ? mapRow(rows[0]) : null;
}

/** Queue a campaign to auto-send at a future time. The cron delivers it. */
export async function createScheduledCampaign(storeSlug: string, c: { subject: string; body: string; link?: string | null; segment?: string | null; scheduledAt: Date }): Promise<Campaign> {
 await ensureTable();
 const rows = (await db()`
 INSERT INTO store_campaigns (store_slug, subject, body, link, segment, status, scheduled_at)
 VALUES (${storeSlug}, ${c.subject.slice(0, 200)}, ${c.body.slice(0, 10000)}, ${c.link ?? null}, ${c.segment ?? null}, 'scheduled', ${c.scheduledAt.toISOString()})
 RETURNING *
 `) as any[];
 return mapRow(rows[0]);
}

/** Cancel an upcoming scheduled campaign (only if it hasn't sent yet). */
export async function cancelScheduledCampaign(storeSlug: string, id: number): Promise<boolean> {
 await ensureTable();
 const rows = (await db()`
 UPDATE store_campaigns SET status = 'canceled'
 WHERE store_slug = ${storeSlug} AND id = ${id} AND status = 'scheduled'
 RETURNING id
 `.catch(() => [])) as any[];
 return rows.length > 0;
}

/** Log a campaign that was just sent (from the Sidekick's immediate send). */
export async function recordSentCampaign(storeSlug: string, c: { subject: string; body: string; link?: string | null; segment?: string | null; recipientCount: number }): Promise<void> {
 await ensureTable();
 await db()`
 INSERT INTO store_campaigns (store_slug, subject, body, link, segment, status, sent_at, recipient_count)
 VALUES (${storeSlug}, ${c.subject.slice(0, 200)}, ${c.body.slice(0, 10000)}, ${c.link ?? null}, ${c.segment ?? null}, 'sent', now(), ${c.recipientCount})
 `.catch(() => {});
}

// ── Delivery — the single path both the Sidekick and the cron use ──────────────
/** Resolve who a campaign reaches: a tagged segment, or all subscribers. */
export async function resolveRecipients(storeSlug: string, segment?: string | null): Promise<string[]> {
 if (segment) {
 const tag = String(segment).toLowerCase().trim();
 const profiles = await listCustomerProfiles(storeSlug).catch(() => []);
 return Array.from(new Set(profiles.filter((p) => p.subscribed && p.tags.includes(tag) && (p.email || "").includes("@")).map((p) => p.email.toLowerCase())));
 }
 const subs = await listSubscribers(storeSlug).catch(() => []);
 return Array.from(new Set(subs.map((s) => s.email).filter(Boolean)));
}

/** Actually deliver a campaign now (used by immediate send AND the scheduler cron). Returns recipient count. */
export async function deliverCampaign(storeSlug: string, c: { subject: string; body: string; link?: string | null; segment?: string | null }): Promise<{ recipientCount: number }> {
 const [sender, brand, recipients] = await Promise.all([
 resolveStoreSender(storeSlug),
 getStoreEmailBrand(storeSlug),
 resolveRecipients(storeSlug, c.segment),
 ]);
 if (!recipients.length) return { recipientCount: 0 };
 await sendStoreCampaign({ storeSlug, storeName: sender.fromName, storeEmail: sender.replyTo, fromAddress: sender.fromAddress, subject: c.subject.slice(0, 200), body: c.body.slice(0, 10000), link: c.link || undefined, brand, recipients } as any);
 return { recipientCount: recipients.length };
}

/** The scheduler: claim due scheduled campaigns and deliver each. Idempotent via a status guard. */
export async function sendDueCampaigns(now: Date): Promise<{ sent: number; recipients: number; failed: number }> {
 await ensureTable();
 const sql = db();
 // Claim atomically: the row-locking subquery (FOR UPDATE SKIP LOCKED) hands each due row to
 // exactly one concurrent run, and the outer status guard means an already-claimed row is never
 // re-sent — so overlapping cron invocations can't double-send to subscribers.
 const due = (await sql`
 UPDATE store_campaigns SET status = 'sending'
 WHERE status = 'scheduled' AND id IN (
 SELECT id FROM store_campaigns WHERE status = 'scheduled' AND scheduled_at <= ${now.toISOString()} ORDER BY scheduled_at ASC FOR UPDATE SKIP LOCKED LIMIT 100
 )
 RETURNING *
 `.catch(() => [])) as any[];
 let sent = 0, recipients = 0, failed = 0;
 for (const row of due) {
 try {
 const r = await deliverCampaign(row.store_slug, { subject: row.subject, body: row.body, link: row.link, segment: row.segment });
 await sql`UPDATE store_campaigns SET status = 'sent', sent_at = now(), recipient_count = ${r.recipientCount} WHERE id = ${row.id}`;
 sent++; recipients += r.recipientCount;
 } catch (err) {
 await sql`UPDATE store_campaigns SET status = 'failed' WHERE id = ${row.id}`.catch(() => {});
 failed++;
 }
 }
 return { sent, recipients, failed };
}
