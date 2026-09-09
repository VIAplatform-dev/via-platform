import { neon } from "@neondatabase/serverless";

// Who is due the next-day thank-you from a printed flyer.
//
// Access is granted at signup, not here — this is only the email. If this job never ran, everyone
// would still be browsing; they would simply not have heard from us.
//
// It is worth more than a courtesy, though: the access cookie lives in the phone that scanned the
// QR. The email carries a magic sign-in link, so it is what gets someone onto their laptop.

function db() {
 const url = process.env.DATABASE_URL;
 if (!url) throw new Error("DATABASE_URL is not set");
 return neon(url);
}

let ensured = false;
async function ensureColumn() {
 if (ensured) return;
 // Lazy migration, matching how the rest of pilot_access grew. Its own column rather than reusing
 // approval_email_sent: that flag belongs to the waitlist approval mail, and one job clearing the
 // other's flag would silently stop the other's email.
 await db()`ALTER TABLE pilot_access ADD COLUMN IF NOT EXISTS flyer_welcome_sent_at TIMESTAMP WITH TIME ZONE`;
 ensured = true;
}

export type FlyerSignup = { email: string; source: string };

/**
 * Approved flyer signups from at least `afterHours` ago that have not been thanked.
 *
 * The delay is the point — "next day", not "immediately", so it lands as a note rather than a
 * receipt. The lower bound also means a run that is late (or re-run) still finds them.
 */
export async function getFlyerSignupsDueWelcome(afterHours = 20, limit = 200): Promise<FlyerSignup[]> {
 await ensureColumn();
 const rows = await db()`
  SELECT email, source
  FROM pilot_access
  WHERE status = 'approved'
   AND source LIKE 'flyer:%'
   AND flyer_welcome_sent_at IS NULL
   AND approved_at IS NOT NULL
   AND approved_at < NOW() - (${afterHours} || ' hours')::interval
  ORDER BY approved_at ASC
  LIMIT ${limit}`;
 return (rows as { email: string; source: string }[]).map((r) => ({ email: r.email, source: r.source }));
}

/** Marked only after the send succeeds, so a failed send is retried tomorrow rather than lost. */
export async function markFlyerWelcomeSent(email: string): Promise<void> {
 await ensureColumn();
 await db()`UPDATE pilot_access SET flyer_welcome_sent_at = NOW() WHERE email = ${email.toLowerCase().trim()}`;
}
