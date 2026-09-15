import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { sendReengagementEmail } from "@/app/lib/email";
import crypto from "crypto";

export const maxDuration = 300;

const CAMPAIGN = "reengagement-never-logged-in-2026-04";

function getDatabaseUrl() {
 const url = process.env.DATABASE_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return url;
}

function hashPassword(password: string): string {
 return crypto.createHash("sha256").update(password).digest("hex");
}

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const adminToken = request.cookies.get("via_admin_token")?.value;
 if (adminToken && adminToken === hashPassword(adminPassword)) return true;
 return false;
}

async function ensureSentTable() {
 const sql = neon(getDatabaseUrl());
 await sql`
 CREATE TABLE IF NOT EXISTS email_campaign_sends (
 id SERIAL PRIMARY KEY,
 campaign VARCHAR(100) NOT NULL,
 email VARCHAR(255) NOT NULL,
 sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
 UNIQUE (campaign, email)
 )
 `;
}

async function getAlreadySentEmails(campaign: string): Promise<Set<string>> {
 const sql = neon(getDatabaseUrl());
 const rows = await sql`
 SELECT LOWER(email) AS email FROM email_campaign_sends
 WHERE campaign = ${campaign}
 `;
 return new Set(rows.map((r) => r.email as string));
}

async function markEmailsAsSent(campaign: string, emails: string[]) {
 if (emails.length === 0) return;
 const sql = neon(getDatabaseUrl());
 for (const email of emails) {
 await sql`
 INSERT INTO email_campaign_sends (campaign, email)
 VALUES (${campaign}, ${email.toLowerCase()})
 ON CONFLICT (campaign, email) DO NOTHING
 `;
 }
}

/** Approved users who have never signed in (no row in the users table). */
async function getApprovedNeverLoggedIn(): Promise<{ email: string; firstName: string | null }[]> {
 const sql = neon(getDatabaseUrl());
 const rows = await sql`
 SELECT pa.email, pa.first_name
 FROM pilot_access pa
 WHERE pa.status = 'approved'
 AND pa.email IS NOT NULL
 AND NOT EXISTS (
 SELECT 1 FROM users u
 WHERE LOWER(u.email) = LOWER(pa.email)
 )
 ORDER BY pa.approved_at DESC
 `;
 return rows.map((r) => ({ email: r.email as string, firstName: r.first_name as string | null }));
}

/**
 * POST /api/admin/send-reengagement
 *
 * { testEmail: "you@example.com" }: test send only, not tracked
 * { preview: true }: returns counts without sending
 * { send: true }: sends only to people who haven't received this campaign
 */
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 await ensureSentTable();

 const body = await request.json().catch(() => ({}));
 const testEmail: string | undefined = body?.testEmail;
 const sendForReal: boolean = body?.send === true;
 const preview: boolean = body?.preview === true;

 if (!testEmail && !sendForReal && !preview) {
 return NextResponse.json(
 { error: "Provide { testEmail }, { send: true }, or { preview: true }." },
 { status: 400 }
 );
 }

 // Test send, not tracked so it won't block the real send later
 if (testEmail) {
 const { sent, failed } = await sendReengagementEmail([{ email: testEmail, firstName: null }]);
 return NextResponse.json({ success: true, test: true, testEmail, sent, failed });
 }

 const candidates = await getApprovedNeverLoggedIn();
 const alreadySent = await getAlreadySentEmails(CAMPAIGN);
 const unsent = candidates.filter((c) => !alreadySent.has(c.email.toLowerCase()));

 if (preview) {
 return NextResponse.json({
 preview: true,
 campaign: CAMPAIGN,
 totalEligible: candidates.length,
 alreadySent: alreadySent.size,
 toSend: unsent.length,
 sample: unsent.slice(0, 5).map((c) => c.email),
 });
 }

 if (unsent.length === 0) {
 return NextResponse.json({ success: true, message: "Everyone has already been sent this email.", sent: 0 });
 }

 const { sent, failed } = await sendReengagementEmail(unsent);
 await markEmailsAsSent(CAMPAIGN, unsent.map((c) => c.email));

 return NextResponse.json({ success: true, campaign: CAMPAIGN, toSend: unsent.length, sent, failed });
}
