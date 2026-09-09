import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export async function POST(request: NextRequest) {
 const body = await request.json().catch(() => ({}));
 const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : null;
 const reason = typeof body.reason === "string" ? body.reason.trim() : null;
 const detail = typeof body.detail === "string" ? body.detail.trim().slice(0, 500) : null;

 if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  return NextResponse.json({ error: "Enter the email address you want unsubscribed." }, { status: 400 });
 }

 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database URL" }, { status: 500 });

 const sql = neon(dbUrl);

 // Ensure column exists
 await sql`ALTER TABLE pilot_access ADD COLUMN IF NOT EXISTS email_unsubscribed BOOLEAN DEFAULT FALSE`;
 await sql`ALTER TABLE pilot_access ADD COLUMN IF NOT EXISTS unsubscribe_reason TEXT`;
 await sql`ALTER TABLE pilot_access ADD COLUMN IF NOT EXISTS unsubscribe_detail TEXT`;
 await sql`ALTER TABLE pilot_access ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ`;

 await sql`
 UPDATE pilot_access
 SET
 email_unsubscribed = TRUE,
 unsubscribe_reason = ${reason},
 unsubscribe_detail = ${detail},
 unsubscribed_at = NOW()
 WHERE LOWER(email) = ${email}
 `;

 // The flag that actually stops the mail.
 //
 // `pilot_access.email_unsubscribed` above is read by exactly ONE query — the new-arrivals blast.
 // Every other send (favourites, trending, winback, last chance, viewed item, price drops, the
 // store digest, the Insider newsletter) filters on `users.notification_emails_enabled`, and
 // unsubscribing never touched it. So someone clicked Unsubscribe, was told they'd hear nothing
 // more, and kept receiving nine other kinds of email. Both flags get set now, and this is the one
 // that carries.
 await sql`
 UPDATE users SET notification_emails_enabled = FALSE, updated_at = NOW()
 WHERE LOWER(email) = ${email}
 `;

 // Someone who is on no list at all still deserves a record of having asked, so a later import or
 // signup can't quietly resubscribe them. An INSERT only when nothing matched — never overwriting
 // an existing row's status.
 await sql`
 INSERT INTO pilot_access (email, status, email_unsubscribed, unsubscribe_reason, unsubscribe_detail, unsubscribed_at)
 SELECT ${email}, 'pending', TRUE, ${reason}, ${detail}, NOW()
 WHERE NOT EXISTS (SELECT 1 FROM pilot_access WHERE LOWER(email) = ${email})
 `;

 return NextResponse.json({ ok: true });
}
