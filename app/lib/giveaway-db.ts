import { neon } from "@neondatabase/serverless";

const getDatabaseUrl = () => {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) {
 throw new Error("DATABASE_URL or POSTGRES_URL environment variable is not set.");
 }
 return url;
};

export interface GiveawayEntry {
 id: number;
 email: string;
 referralCode: string;
 referredByCode: string | null;
 referralCount: number;
 friend1Email: string | null;
 friend2Email: string | null;
 phone1: string | null;
 phone2: string | null;
 reminderSentAt: Date | null;
 createdAt: Date;
 updatedAt: Date;
}

export type ReminderCategory = 'no_activity' | 'invited_no_entries' | 'one_referral';

export interface ReminderCandidate {
 entry: GiveawayEntry;
 category: ReminderCategory;
}

// Characters excluding ambiguous ones (O/0/I/1)
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateReferralCode(): string {
 let code = "";
 for (let i = 0; i < 8; i++) {
 code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
 }
 return code;
}

export async function initGiveawayDatabase() {
 const sql = neon(getDatabaseUrl());

 await sql`
 CREATE TABLE IF NOT EXISTS giveaway_entries (
 id SERIAL PRIMARY KEY,
 email VARCHAR(255) NOT NULL UNIQUE,
 referral_code VARCHAR(12) NOT NULL UNIQUE,
 referred_by_code VARCHAR(12),
 referral_count INT DEFAULT 0,
 friend_1_email VARCHAR(255),
 friend_2_email VARCHAR(255),
 phone_1 VARCHAR(20),
 phone_2 VARCHAR(20),
 created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
 updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 )
 `;

 await sql`CREATE INDEX IF NOT EXISTS idx_giveaway_referral_code ON giveaway_entries(referral_code)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_giveaway_email ON giveaway_entries(email)`;
 await sql`CREATE INDEX IF NOT EXISTS idx_giveaway_referred_by ON giveaway_entries(referred_by_code)`;

 await sql`ALTER TABLE giveaway_entries ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP WITH TIME ZONE`;
 await sql`CREATE INDEX IF NOT EXISTS idx_giveaway_reminder_candidates ON giveaway_entries(updated_at) WHERE referral_count < 2 AND reminder_sent_at IS NULL`;
}

export async function createGiveawayEntry(
 email: string,
 referredByCode?: string
): Promise<{ referralCode: string; isExisting: boolean }> {
 const sql = neon(getDatabaseUrl());
 await initGiveawayDatabase();

 // Check if email already exists
 const existing = await sql`
 SELECT referral_code FROM giveaway_entries WHERE email = ${email.toLowerCase()}
 `;

 if (existing.length > 0) {
 return { referralCode: existing[0].referral_code as string, isExisting: true };
 }

 // Generate unique referral code with retry on collision
 let referralCode = generateReferralCode();
 let attempts = 0;
 while (attempts < 10) {
 try {
 await sql`
 INSERT INTO giveaway_entries (email, referral_code, referred_by_code)
 VALUES (${email.toLowerCase()}, ${referralCode}, ${referredByCode || null})
 `;
 return { referralCode, isExisting: false };
 } catch (err: unknown) {
 const error = err as { code?: string };
 // Unique violation on referral_code. Retry with new code
 if (error.code === "23505") {
 referralCode = generateReferralCode();
 attempts++;
 continue;
 }
 throw err;
 }
 }

 throw new Error("Failed to generate unique referral code after 10 attempts");
}

export async function getEntryByCode(code: string): Promise<GiveawayEntry | null> {
 const sql = neon(getDatabaseUrl());
 await initGiveawayDatabase();

 const upperCode = code.toUpperCase();

 const result = await sql`
 SELECT * FROM giveaway_entries WHERE UPPER(referral_code) = ${upperCode}
 `;

 if (result.length === 0) return null;

 // Compute the true referral count from the actual referred entries
 // (the referral_count column can drift due to race conditions)
 const countResult = await sql`
 SELECT COUNT(*)::int AS real_count
 FROM giveaway_entries
 WHERE UPPER(referred_by_code) = ${upperCode}
 `;
 const realCount = countResult[0]?.real_count ?? 0;

 // Sync the column if it drifted
 if (realCount !== result[0].referral_count) {
 await sql`
 UPDATE giveaway_entries
 SET referral_count = ${realCount}
 WHERE UPPER(referral_code) = ${upperCode}
 `;
 }

 const entry = mapRow(result[0]);
 entry.referralCount = realCount as number;
 return entry;
}

export async function getEntryByEmail(email: string): Promise<GiveawayEntry | null> {
 const sql = neon(getDatabaseUrl());
 await initGiveawayDatabase();

 const result = await sql`
 SELECT * FROM giveaway_entries WHERE email = ${email.toLowerCase()}
 `;

 if (result.length === 0) return null;

 // Compute the true referral count from actual referred entries
 const upperCode = (result[0].referral_code as string).toUpperCase();
 const countResult = await sql`
 SELECT COUNT(*)::int AS real_count
 FROM giveaway_entries
 WHERE UPPER(referred_by_code) = ${upperCode}
 `;
 const realCount = countResult[0]?.real_count ?? 0;

 if (realCount !== result[0].referral_count) {
 await sql`
 UPDATE giveaway_entries
 SET referral_count = ${realCount}
 WHERE UPPER(referral_code) = ${upperCode}
 `;
 }

 const entry = mapRow(result[0]);
 entry.referralCount = realCount as number;
 return entry;
}

export async function recordPhoneInvites(
 code: string,
 phone1: string,
 phone2: string
): Promise<void> {
 const sql = neon(getDatabaseUrl());
 await initGiveawayDatabase();

 await sql`
 UPDATE giveaway_entries
 SET phone_1 = ${phone1}, phone_2 = ${phone2}, updated_at = NOW()
 WHERE referral_code = ${code}
 `;
}

export async function processReferralEntry(
 newEmail: string,
 referrerCode: string
): Promise<{ referrerEntry: GiveawayEntry; friendNumber: 1 | 2 | null } | null> {
 const sql = neon(getDatabaseUrl());
 await initGiveawayDatabase();

 const upperCode = referrerCode.toUpperCase();
 const lowerEmail = newEmail.toLowerCase();

 // Compute the true referral count from actual entries with this referred_by_code.
 // The friend's entry was already created with referred_by_code set by
 // createGiveawayEntry, so realCount already includes them.
 const countResult = await sql`
 SELECT COUNT(*)::int AS real_count
 FROM giveaway_entries
 WHERE UPPER(referred_by_code) = ${upperCode}
 `;
 const realCount = (countResult[0]?.real_count ?? 0) as number;

 // Get the referrer's current state
 const referrerResult = await sql`
 SELECT * FROM giveaway_entries WHERE UPPER(referral_code) = ${upperCode}
 `;
 if (referrerResult.length === 0) return null;

 const storedCount = referrerResult[0].referral_count as number;

 // If the true count hasn't increased, this referral was already processed
 if (realCount <= storedCount) {
 return { referrerEntry: mapRow(referrerResult[0]), friendNumber: null };
 }

 // Update the referrer's count and fill friend email slots
 const result = await sql`
 UPDATE giveaway_entries
 SET
 referral_count = ${realCount},
 friend_1_email = CASE WHEN friend_1_email IS NULL THEN ${lowerEmail} ELSE friend_1_email END,
 friend_2_email = CASE WHEN friend_1_email IS NOT NULL AND friend_2_email IS NULL THEN ${lowerEmail} ELSE friend_2_email END,
 updated_at = NOW()
 WHERE UPPER(referral_code) = ${upperCode}
 RETURNING *
 `;

 if (result.length === 0) return null;

 const entry = mapRow(result[0]);
 const friendNumber = realCount === 1 ? 1 : realCount === 2 ? 2 : null;
 return { referrerEntry: entry, friendNumber };
}

export async function setReferredByCode(email: string, refCode: string): Promise<void> {
 const sql = neon(getDatabaseUrl());
 await initGiveawayDatabase();

 await sql`
 UPDATE giveaway_entries
 SET referred_by_code = ${refCode}, updated_at = NOW()
 WHERE email = ${email.toLowerCase()} AND referred_by_code IS NULL
 `;
}

function mapRow(row: Record<string, unknown>): GiveawayEntry {
 return {
 id: row.id as number,
 email: row.email as string,
 referralCode: row.referral_code as string,
 referredByCode: row.referred_by_code as string | null,
 referralCount: row.referral_count as number,
 friend1Email: row.friend_1_email as string | null,
 friend2Email: row.friend_2_email as string | null,
 phone1: row.phone_1 as string | null,
 phone2: row.phone_2 as string | null,
 reminderSentAt: row.reminder_sent_at ? new Date(row.reminder_sent_at as string) : null,
 createdAt: new Date(row.created_at as string),
 updatedAt: new Date(row.updated_at as string),
 };
}

export async function getReminderCandidates(): Promise<ReminderCandidate[]> {
 const sql = neon(getDatabaseUrl());
 await initGiveawayDatabase();

 const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

 const rows = await sql`
 SELECT *,
 CASE
 WHEN referral_count = 0 AND phone_1 IS NULL THEN 'no_activity'
 WHEN referral_count = 0 AND phone_1 IS NOT NULL THEN 'invited_no_entries'
 WHEN referral_count = 1 THEN 'one_referral'
 END AS reminder_category
 FROM giveaway_entries
 WHERE referral_count < 2
 AND reminder_sent_at IS NULL
 AND updated_at <= ${twoDaysAgo}
 `;

 return rows.map(row => ({
 entry: mapRow(row),
 category: row.reminder_category as ReminderCategory,
 }));
}

export async function getReminderStats(): Promise<{
 total: number;
 completed: number;
 alreadyReminded: number;
 tooRecent: number;
 eligible: number;
}> {
 const sql = neon(getDatabaseUrl());
 await initGiveawayDatabase();

 const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

 const rows = await sql`
 SELECT
 COUNT(*)::int AS total,
 COUNT(*) FILTER (WHERE referral_count >= 2)::int AS completed,
 COUNT(*) FILTER (WHERE referral_count < 2 AND reminder_sent_at IS NOT NULL)::int AS already_reminded,
 COUNT(*) FILTER (WHERE referral_count < 2 AND reminder_sent_at IS NULL AND updated_at > ${twoDaysAgo})::int AS too_recent,
 COUNT(*) FILTER (WHERE referral_count < 2 AND reminder_sent_at IS NULL AND updated_at <= ${twoDaysAgo})::int AS eligible
 FROM giveaway_entries
 `;

 const row = rows[0];
 return {
 total: row.total as number,
 completed: row.completed as number,
 alreadyReminded: row.already_reminded as number,
 tooRecent: row.too_recent as number,
 eligible: row.eligible as number,
 };
}

export async function markReminderSent(id: number): Promise<void> {
 const sql = neon(getDatabaseUrl());

 await sql`
 UPDATE giveaway_entries
 SET reminder_sent_at = NOW()
 WHERE id = ${id}
 `;
}

export async function getLeaderboard(): Promise<GiveawayEntry[]> {
 const sql = neon(getDatabaseUrl());
 await initGiveawayDatabase();

 const rows = await sql`
 SELECT * FROM giveaway_entries
 ORDER BY referral_count DESC, created_at ASC
 `;

 return rows.map(mapRow);
}
