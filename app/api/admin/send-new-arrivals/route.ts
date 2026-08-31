import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getApprovedPilotEmails } from "@/app/lib/pilot-db";
import { sendNewArrivalsEmail, NEW_ARRIVALS_SUBJECT_KEY } from "@/app/lib/email";
import { getEmailPickProducts } from "@/app/lib/editors-picks-db";
import { getSetting, saveSetting } from "@/app/lib/settings-db";
import type { DBProduct } from "@/app/lib/db";
import { DISABLED_STORE_SLUGS } from "@/app/lib/db";
import { brands as brandDefs } from "@/app/lib/brandData";
import crypto from "crypto";

export const maxDuration = 300;

// Lowercase ILIKE patterns for all known designer brand keywords
const DESIGNER_PATTERNS = brandDefs.flatMap((b) => b.keywords.map((k) => `%${k}%`));

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

/**
 * POST /api/admin/send-new-arrivals
 *
 * { preview: true } — show product count and since date without sending
 * { send: true } — send to all approved pilot users and reset the cron lock
 * { testEmail: "x" } — send only to that address, does not reset the lock
 */
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const body = await request.json().catch(() => ({}));
 const preview: boolean = body?.preview === true;
 const sendForReal: boolean = body?.send === true;
 const testEmail: string | undefined = body?.testEmail;

 if (!preview && !sendForReal && !testEmail) {
 return NextResponse.json(
 { error: "Provide { preview: true }, { send: true }, or { testEmail: '...' }." },
 { status: 400 }
 );
 }

 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database URL" }, { status: 500 });

 const sql = neon(dbUrl);
 const lastSentRaw = await getSetting("new_arrivals_last_sent_at");
 const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
 // Always look back at least 7 days — if the cron ran recently and set the lock
 // to today, using that as `since` would produce an empty window.
 const since = lastSentRaw && new Date(lastSentRaw) < sevenDaysAgo
 ? new Date(lastSentRaw)
 : sevenDaysAgo;
 const sinceIso = since.toISOString();

 // Diversify across stores so the email highlights everyone — round-robin one
 // item per store (rn=1) before any store's second item, instead of letting the
 // most-recently-synced store fill the whole email.
 const rows = await sql`
 WITH base AS (
 SELECT *,
 CASE WHEN lower(title) LIKE ANY(${DESIGNER_PATTERNS}::text[]) THEN 1 ELSE 0 END AS is_designer
 FROM products
 WHERE created_at IS NOT NULL
 AND created_at >= ${sinceIso}
 AND created_at <= NOW() - interval '24 hours'
 AND (shopify_product_id IS NULL OR collabs_link IS NOT NULL)
 AND title NOT ILIKE '%gift card%'
 AND image IS NOT NULL AND image != ''
 AND (${DISABLED_STORE_SLUGS.length} = 0 OR store_slug != ALL(${DISABLED_STORE_SLUGS}))
 ),
 store_scores AS (
 SELECT store_slug,
 COUNT(*)::int AS total_count,
 SUM(is_designer)::int AS designer_count
 FROM base
 GROUP BY store_slug
 ),
 ranked AS (
 SELECT b.*,
 ROW_NUMBER() OVER (
 PARTITION BY b.store_slug
 ORDER BY b.is_designer DESC, b.created_at DESC
 ) AS rn,
 ss.designer_count,
 ss.total_count
 FROM base b
 JOIN store_scores ss ON ss.store_slug = b.store_slug
 )
 SELECT id, store_slug, store_name, title, price, currency, compare_at_price,
 image, images, external_url, size, variant_id, collabs_link,
 shopify_product_id, created_at
 FROM ranked
 ORDER BY rn ASC, designer_count DESC, total_count DESC
 LIMIT 50
 `;

 // Hand-curated email picks (from /admin/collections → "New Arrivals Email") take precedence,
 // exactly like the cron — otherwise the manual button would ignore your curation and send the
 // auto-ranked window instead. Fall back to the auto window only when nothing is curated.
 const emailPicks = await getEmailPickProducts();
 const usingPicks = emailPicks.length > 0;
 const products = usingPicks ? emailPicks : (rows as DBProduct[]);

 if (preview) {
 return NextResponse.json({ preview: true, since: sinceIso, products: products.length, usingPicks });
 }

 if (products.length === 0) {
 return NextResponse.json({ ok: true, message: "No new arrivals in window.", since: sinceIso, products: 0, sent: 0 });
 }

 const emails = testEmail ? [testEmail] : await getApprovedPilotEmails();

 if (emails.length === 0) {
 return NextResponse.json({ ok: true, message: "No approved users to email.", sent: 0 });
 }

 const { sent, failed } = await sendNewArrivalsEmail(emails, products, usingPicks, await getSetting(NEW_ARRIVALS_SUBJECT_KEY).catch(() => null));

 // Reset the cron lock so the scheduled job won't double-send this week
 if (sendForReal) {
 await saveSetting("new_arrivals_last_sent_at", new Date().toISOString());
 }

 return NextResponse.json({
 ok: true,
 since: sinceIso,
 products: products.length,
 emails: emails.length,
 sent,
 failed,
 test: !!testEmail,
 });
}
