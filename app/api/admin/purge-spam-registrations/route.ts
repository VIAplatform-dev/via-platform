import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

// Clean up the bot-spam pilot registrations (casino/link spam injected into the name fields).
// Matches only rows whose NAME contains a URL or spam markers, real names never do, and never
// touches approved accounts. GET = dry-run preview (count + samples); GET ?apply=1 = delete.
// Admin-gated (middleware also guards /api/admin/*).

function getDb() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return neon(url);
}
function isAuthorized(request: NextRequest): boolean {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) return false;
 if (request.headers.get("authorization") === `Bearer ${pw}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(pw).digest("hex");
}

// A name containing a link, messaging handle, casino keyword, or spam emoji is the bot signature.
const SPAM_RE = "(https?://|www\\.|bit\\.ly|t\\.me|wa\\.me|telegram|whatsapp|casino|bonus|spin|[a-z0-9-]+\\.(com|net|ru|xyz|top|shop|link|online|site|club|vip))";
const EMOJI_RE = "[✨\u{1F3B0}\u{1F381}\u{1F4B0}\u{1F525}]";

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const apply = new URL(request.url).searchParams.get("apply") === "1";
 const sql = getDb();

 // Only ever purge non-approved rows so a genuinely approved user can never be swept up.
 const matchRows = (await sql`
 SELECT count(*)::int AS n FROM pilot_access
 WHERE status <> 'approved'
  AND (first_name ~* ${SPAM_RE} OR COALESCE(last_name,'') ~* ${SPAM_RE} OR first_name ~ ${EMOJI_RE})
 `.catch(() => [{ n: -1 }])) as { n: number }[];
 const totalRows = (await sql`SELECT count(*)::int AS n FROM pilot_access`.catch(() => [{ n: -1 }])) as { n: number }[];
 const match = matchRows[0].n, total = totalRows[0].n;

 if (!apply) {
 const samples = await sql`
  SELECT email, first_name, status, created_at FROM pilot_access
  WHERE status <> 'approved'
   AND (first_name ~* ${SPAM_RE} OR COALESCE(last_name,'') ~* ${SPAM_RE} OR first_name ~ ${EMOJI_RE})
  LIMIT 8
 `.catch(() => []);
 return NextResponse.json({
 dryRun: true, wouldDelete: match, totalPilotAccess: total, remainingAfter: total - match, samples,
 note: "Re-run with ?apply=1 to delete. Only non-approved spam rows (name contains a link/marker/emoji) are removed.",
 });
 }

 await sql`
 DELETE FROM pilot_access
 WHERE status <> 'approved'
  AND (first_name ~* ${SPAM_RE} OR COALESCE(last_name,'') ~* ${SPAM_RE} OR first_name ~ ${EMOJI_RE})
 `;
 const afterRows = (await sql`SELECT count(*)::int AS n FROM pilot_access`.catch(() => [{ n: -1 }])) as { n: number }[];
 return NextResponse.json({ ok: true, deleted: match, remaining: afterRows[0].n });
}
