import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { createHash } from "crypto";

function hashPassword(password: string): string {
 return createHash("sha256").update(password).digest("hex");
}
function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return token === hashPassword(adminPassword);
}

// Map an email's utm_campaign (set by withUtm in email.ts) to the same category
// slug the webhook derives from the subject, so first-party clicks line up with
// delivered/opened events. Unknown campaigns fall to "other".
function campaignToCategory(campaign: string | null): string {
 if (!campaign) return "other";
 const c = campaign.toLowerCase();
 if (c.startsWith("giveaway")) return "giveaway";
 if (c.startsWith("insider")) return "insider_arrivals";
 if (c.startsWith("new_arrivals")) return "new_arrivals";
 if (c.startsWith("membership")) return "membership";
 if (c.startsWith("sourcing")) return "sourcing";
 if (c.startsWith("abandoned")) return "abandoned_cart";
 if (c.startsWith("favorite")) return "favorite_activity";
 if (c.startsWith("trending")) return "trending_item";
 return "other";
}

const CATEGORY_LABELS: Record<string, string> = {
 magic_link: "Magic Link (Sign In)",
 waitlist: "Waitlist Confirmation",
 pilot_approval: "Pilot Approval",
 insider_arrivals: "Insider New Arrivals",
 new_arrivals: "New Arrivals",
 sourcing: "Sourcing",
 favorite_activity:"Favorite Activity",
 abandoned_cart: "Abandoned Cart",
 trending_item: "Trending Item",
 popup_thank_you: "NYC Pop-Up Thank You",
 giveaway: "Giveaway",
 membership: "Membership",
 internal_alert: "Internal Alert",
 other: "Other",
};

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });

 const sql = neon(dbUrl);

 // Check table exists, if not, return empty
 const tableExists = await sql`
 SELECT 1 FROM information_schema.tables
 WHERE table_name = 'email_events'
 LIMIT 1
 `;
 if (tableExists.length === 0) {
 return NextResponse.json({ categories: [], totals: { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 } });
 }

 const rows = await sql`
 SELECT
 category,
 COUNT(*) FILTER (WHERE event_type = 'email.sent') ::int AS sent,
 COUNT(*) FILTER (WHERE event_type = 'email.delivered') ::int AS delivered,
 COUNT(*) FILTER (WHERE event_type = 'email.opened') ::int AS opened,
 COUNT(*) FILTER (WHERE event_type = 'email.clicked') ::int AS clicked,
 COUNT(*) FILTER (WHERE event_type = 'email.bounced') ::int AS bounced,
 COUNT(*) FILTER (WHERE event_type = 'email.complained') ::int AS complained,
 COUNT(DISTINCT recipient) FILTER (WHERE event_type = 'email.sent') ::int AS unique_recipients
 FROM email_events
 GROUP BY category
 ORDER BY sent DESC
 `;

 // First-party clicks per category. Every email link is utm-tagged (withUtm),
 // so our own landings are the reliable click signal. Resend click-tracking is
 // off, so email.clicked above is ~always 0. Fold these in by campaign.
 const fpRows = (await sql`
 SELECT lower(utm_campaign) AS campaign, COUNT(*)::int AS clicks
 FROM utm_visits
 WHERE (lower(utm_source) = 'email' OR lower(utm_medium) = 'email')
 GROUP BY lower(utm_campaign)
 `.catch(() => [])) as Array<{ campaign: string | null; clicks: number }>;
 const fpClicksByCategory = new Map<string, number>();
 for (const r of fpRows) {
 const cat = campaignToCategory(r.campaign);
 fpClicksByCategory.set(cat, (fpClicksByCategory.get(cat) ?? 0) + (r.clicks ?? 0));
 }

 const categories = rows.map((r) => {
 const delivered = r.delivered as number;
 // Prefer the first-party click count; fall back to Resend's if it ever exists.
 const firstPartyClicks = fpClicksByCategory.get(r.category as string) ?? 0;
 const clicked = firstPartyClicks > 0 ? firstPartyClicks : (r.clicked as number);
 return {
 category: r.category as string,
 label: CATEGORY_LABELS[r.category as string] ?? r.category,
 sent: r.sent as number,
 delivered,
 opened: r.opened as number,
 clicked,
 bounced: r.bounced as number,
 complained: r.complained as number,
 uniqueRecipients: r.unique_recipients as number,
 deliveryRate: (r.sent as number) > 0 ? delivered / (r.sent as number) : 0,
 openRate: delivered > 0 ? (r.opened as number) / delivered : 0,
 clickRate: delivered > 0 ? clicked / delivered : 0,
 bounceRate: (r.sent as number) > 0 ? (r.bounced as number) / (r.sent as number) : 0,
 };
 });

 const totals = categories.reduce(
 (acc, c) => ({
 sent: acc.sent + c.sent,
 delivered: acc.delivered + c.delivered,
 opened: acc.opened + c.opened,
 clicked: acc.clicked + c.clicked,
 bounced: acc.bounced + c.bounced,
 complained: acc.complained + c.complained,
 }),
 { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 }
 );

 return NextResponse.json({ categories, totals });
}
