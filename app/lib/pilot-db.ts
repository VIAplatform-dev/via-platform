import { neon } from "@neondatabase/serverless";

function getDb() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  return neon(url);
}

async function ensureTable() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS pilot_access (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      phone VARCHAR(50),
      email_subscribe BOOLEAN DEFAULT false,
      sms_subscribe BOOLEAN DEFAULT false,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMP WITH TIME ZONE
    )
  `;
  // Add referral columns if they don't exist yet
  await sql`
    ALTER TABLE pilot_access
    ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE,
    ADD COLUMN IF NOT EXISTS referred_by VARCHAR(20),
    ADD COLUMN IF NOT EXISTS source VARCHAR(50)
  `;
}

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function createUniqueReferralCode(): Promise<string> {
  const sql = getDb();
  // Try up to 10 times to get a unique code
  for (let i = 0; i < 10; i++) {
    const code = generateReferralCode();
    const existing = await sql`
      SELECT 1 FROM pilot_access WHERE referral_code = ${code} LIMIT 1
    `;
    if (existing.length === 0) return code;
  }
  // Extremely unlikely fallback: append timestamp fragment
  return generateReferralCode() + Date.now().toString(36).slice(-2).toUpperCase();
}

export type PilotStatus = "approved" | "pending" | null;

export async function getPilotStatus(email: string): Promise<PilotStatus> {
  await ensureTable();
  const sql = getDb();
  const rows = await sql`
    SELECT status FROM pilot_access WHERE email = ${email.toLowerCase().trim()}
  `;
  if (rows.length === 0) return null;
  return rows[0].status as "approved" | "pending";
}

export async function getPilotReferralCode(email: string): Promise<string | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT referral_code FROM pilot_access WHERE email = ${email.toLowerCase().trim()}
  `;
  return rows.length > 0 ? (rows[0].referral_code as string | null) : null;
}

export async function createPilotEntry(data: {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  emailSubscribe?: boolean;
  smsSubscribe?: boolean;
  status: "pending" | "approved";
  referredBy?: string;
  source?: string;
}) {
  await ensureTable();
  const sql = getDb();
  const referralCode = await createUniqueReferralCode();
  await sql`
    INSERT INTO pilot_access (
      email, first_name, last_name, phone,
      email_subscribe, sms_subscribe, status, approved_at,
      referral_code, referred_by, source
    )
    VALUES (
      ${data.email.toLowerCase().trim()},
      ${data.firstName ?? null},
      ${data.lastName ?? null},
      ${data.phone ?? null},
      ${data.emailSubscribe ?? false},
      ${data.smsSubscribe ?? false},
      ${data.status},
      ${data.status === "approved" ? new Date().toISOString() : null},
      ${referralCode},
      ${data.referredBy ?? null},
      ${data.source ?? null}
    )
    ON CONFLICT (email) DO UPDATE SET
      first_name = COALESCE(EXCLUDED.first_name, pilot_access.first_name),
      last_name = COALESCE(EXCLUDED.last_name, pilot_access.last_name),
      phone = COALESCE(EXCLUDED.phone, pilot_access.phone),
      email_subscribe = EXCLUDED.email_subscribe,
      sms_subscribe = EXCLUDED.sms_subscribe,
      referred_by = COALESCE(pilot_access.referred_by, EXCLUDED.referred_by),
      referral_code = COALESCE(pilot_access.referral_code, EXCLUDED.referral_code),
      source = COALESCE(pilot_access.source, EXCLUDED.source)
  `;
  return referralCode;
}

export async function approvePilotUser(email: string) {
  await ensureTable();
  const sql = getDb();
  const normalizedEmail = email.toLowerCase().trim();

  // Try to update an existing pending row first
  const result = await sql`
    UPDATE pilot_access
    SET status = 'approved', approved_at = NOW()
    WHERE email = ${normalizedEmail} AND status = 'pending'
    RETURNING email
  `;

  // If no row existed (waitlist-only user), insert them as approved
  if (result.length === 0) {
    const referralCode = await createUniqueReferralCode();
    await sql`
      INSERT INTO pilot_access (email, status, approved_at, referral_code)
      VALUES (${normalizedEmail}, 'approved', NOW(), ${referralCode})
      ON CONFLICT (email) DO UPDATE
        SET status = 'approved', approved_at = NOW()
    `;
  }
}

/**
 * Returns the next batch of users to approve — 50 a week, run by the Monday cron.
 * Includes both pilot_access rows with status='pending' AND waitlist-only users
 * (those not yet in pilot_access). Priority: most referrals first, then oldest signup.
 */
export async function getPendingUsersToApprove(): Promise<
  { email: string; first_name: string | null }[]
> {
  await ensureTable();
  const sql = getDb();
  const rows = await sql`
    SELECT email, first_name FROM (
      SELECT pa.email, pa.first_name, pa.created_at,
        COALESCE(refs.ref_count, 0) AS ref_count
      FROM pilot_access pa
      LEFT JOIN (
        SELECT referred_by, COUNT(*) AS ref_count
        FROM pilot_access
        WHERE referred_by IS NOT NULL
        GROUP BY referred_by
      ) refs ON refs.referred_by = pa.referral_code
      WHERE pa.status = 'pending'
      AND pa.created_at < NOW() - INTERVAL '24 hours'
    ) combined
    ORDER BY ref_count DESC, created_at ASC
    LIMIT 50
  `;
  return rows as { email: string; first_name: string | null }[];
}

export async function markApprovalEmailSent(email: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE pilot_access SET approval_email_sent = true WHERE email = ${email.toLowerCase().trim()}
  `;
}

/**
 * Get emails of all approved pilot users (access to VYA platform, not Insider members).
 */
export async function getApprovedPilotEmails(): Promise<string[]> {
  await ensureTable();
  const sql = getDb();
  // DISTINCT so a user with duplicate pilot_access rows isn't emailed twice.
  const rows = await sql`
    SELECT DISTINCT LOWER(email) AS email FROM pilot_access
    WHERE status = 'approved' AND email IS NOT NULL
      AND (email_unsubscribed IS NULL OR email_unsubscribed = FALSE)
  `;
  return rows.map((r) => r.email as string);
}

/**
 * Returns emails of "insider" users — anyone who has done at least one of:
 *  - made a purchase (conversions)
 *  - successfully invited a friend (someone signed up with their referral_code)
 *  - clicked through to a store (clicks)
 *  - favorited a product (product_favorites)
 *
 * Respects email unsubscribe / notification settings.
 */
export async function getInsiderAudienceEmails(): Promise<string[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT DISTINCT LOWER(u.email) AS email
    FROM users u
    WHERE u.email IS NOT NULL AND u.email != ''
      AND COALESCE(u.notification_emails_enabled, TRUE) = TRUE
      AND (
        -- Purchased
        EXISTS (SELECT 1 FROM conversions WHERE user_id::text = u.id::text)
        -- Referred 2+ friends who signed up (earns the newsletter)
        OR EXISTS (
          SELECT 1 FROM pilot_access pa1
          JOIN pilot_access pa2 ON pa2.referred_by = pa1.referral_code
          WHERE LOWER(pa1.email) = LOWER(u.email)
          GROUP BY pa1.referral_code
          HAVING COUNT(*) >= 2
        )
        -- Clicked at least 3 times (meaningful engagement, not a one-off)
        OR (SELECT COUNT(*) FROM clicks WHERE user_id::text = u.id::text) >= 3
        -- Favorited a product
        OR EXISTS (SELECT 1 FROM product_favorites WHERE user_id::text = u.id::text)
      )
    ORDER BY email
  `;
  return rows.map((r) => r.email as string);
}

/** Returns emails of users who have been active (clicked, saved, viewed, or ordered) at least once. */
export async function getActiveUserEmails(): Promise<string[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT LOWER(u.email) AS email
    FROM users u
    WHERE u.email IS NOT NULL AND u.email != ''
      AND (
        EXISTS (SELECT 1 FROM clicks            WHERE user_id::text = u.id::text)
        OR EXISTS (SELECT 1 FROM product_favorites WHERE user_id::text = u.id::text)
        OR EXISTS (SELECT 1 FROM store_favorites   WHERE user_id::text = u.id::text)
        OR EXISTS (SELECT 1 FROM conversions       WHERE user_id::text = u.id::text)
      )
  `;
  return rows.map((r) => r.email as string);
}

export async function isEmailInWaitlist(email: string): Promise<boolean> {
  const sql = getDb();
  try {
    const rows = await sql`
      SELECT 1 FROM waitlist WHERE email = ${email.toLowerCase().trim()} LIMIT 1
    `;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function approveAllWaitlistUsers(): Promise<number> {
  await ensureTable();
  const sql = getDb();
  const waitlistEmails = await sql`SELECT email FROM waitlist`;
  if (waitlistEmails.length === 0) return 0;
  let count = 0;
  for (const { email } of waitlistEmails) {
    await sql`
      INSERT INTO pilot_access (email, status, approved_at)
      VALUES (${email}, 'approved', NOW())
      ON CONFLICT (email) DO UPDATE SET status = 'approved', approved_at = NOW()
    `;
    count++;
  }
  return count;
}

/**
 * Returns the referral code and number of successful referrals for a user.
 */
export async function getReferralInfo(email: string): Promise<{
  referralCode: string | null;
  referralCount: number;
}> {
  await ensureTable();
  const sql = getDb();
  const rows = await sql`
    SELECT referral_code FROM pilot_access WHERE email = ${email.toLowerCase().trim()}
  `;
  if (rows.length === 0) return { referralCode: null, referralCount: 0 };
  let referralCode = rows[0].referral_code as string | null;
  if (!referralCode) {
    // User exists but never got a referral code — assign one now
    referralCode = await createUniqueReferralCode();
    await sql`UPDATE pilot_access SET referral_code = ${referralCode} WHERE email = ${email.toLowerCase().trim()}`;
  }

  const countRows = await sql`
    SELECT COUNT(*) AS cnt FROM pilot_access WHERE referred_by = ${referralCode}
  `;
  return {
    referralCode,
    referralCount: Number(countRows[0].cnt),
  };
}

/**
 * Returns all waitlist users ranked by referral count descending.
 */
export async function getWaitlistLeaderboard(): Promise<{
  rank: number;
  email: string;
  firstName: string | null;
  referralCode: string | null;
  referralCount: number;
  status: string;
  createdAt: Date;
}[]> {
  await ensureTable();
  const sql = getDb();
  const rows = await sql`
    SELECT
      pa.email,
      pa.first_name,
      pa.referral_code,
      pa.status,
      pa.created_at,
      COALESCE(refs.ref_count, 0) AS referral_count
    FROM pilot_access pa
    LEFT JOIN (
      SELECT referred_by, COUNT(*) AS ref_count
      FROM pilot_access
      WHERE referred_by IS NOT NULL
      GROUP BY referred_by
    ) refs ON refs.referred_by = pa.referral_code
    ORDER BY referral_count DESC, pa.created_at ASC
  `;
  return rows.map((r, i) => ({
    rank: i + 1,
    email: r.email as string,
    firstName: r.first_name as string | null,
    referralCode: r.referral_code as string | null,
    referralCount: Number(r.referral_count),
    status: r.status as string,
    createdAt: new Date(r.created_at as string),
  }));
}

/**
 * When a referral signup happens, checks if the referrer has now hit 2 referrals.
 * If so, marks them as an insider (first time only) and returns their info for the welcome email.
 */
export async function checkAndGrantInsider(referralCode: string): Promise<{
  email: string;
  firstName: string | null;
} | null> {
  await ensureTable();
  const sql = getDb();
  await sql`ALTER TABLE pilot_access ADD COLUMN IF NOT EXISTS is_insider BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE pilot_access ADD COLUMN IF NOT EXISTS insider_since TIMESTAMP WITH TIME ZONE`;

  const countRows = await sql`
    SELECT COUNT(*) AS cnt FROM pilot_access WHERE referred_by = ${referralCode}
  `;
  if (Number(countRows[0].cnt) < 2) return null;

  const rows = await sql`
    UPDATE pilot_access
    SET is_insider = TRUE, insider_since = COALESCE(insider_since, NOW())
    WHERE referral_code = ${referralCode}
      AND (is_insider IS NULL OR is_insider = FALSE)
    RETURNING email, first_name
  `;
  if (rows.length === 0) return null;
  return { email: rows[0].email as string, firstName: rows[0].first_name as string | null };
}

export async function getPilotIsInsider(email: string): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    SELECT is_insider FROM pilot_access WHERE email = ${email.toLowerCase().trim()} LIMIT 1
  `;
  return rows[0]?.is_insider === true;
}

/**
 * After a new referral signup, returns the referrer's info so a notification
 * email can be sent. No longer instantly approves — the cron picks them up
 * sooner based on their referral tier (1=5d, 2=4d, 3+=3d).
 */
export async function checkAndApproveReferrer(referralCode: string): Promise<{
  email: string;
  firstName: string | null;
} | null> {
  await ensureTable();
  const sql = getDb();
  const rows = await sql`
    SELECT email, first_name, status FROM pilot_access
    WHERE referral_code = ${referralCode}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const referrer = rows[0] as { email: string; first_name: string | null; status: string };
  if (referrer.status !== "pending") return null;
  return { email: referrer.email, firstName: referrer.first_name };
}
