import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";
import { stores as storeList } from "@/app/lib/stores";
import { canonicalSource, normalizeStoredSource, sourceChannel } from "@/app/lib/traffic-source";

function isAdminAuthenticated(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const adminToken = request.cookies.get("via_admin_token")?.value;
 return !!adminToken && adminToken === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

export async function GET(
 request: NextRequest,
 { params }: { params: Promise<{ email: string }> }
) {
 if (!isAdminAuthenticated(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const { email: encodedEmail } = await params;
 const email = decodeURIComponent(encodedEmail);

 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) return NextResponse.json({ error: "No DB" }, { status: 500 });
 const sql = neon(url);

 const [pilotRows, userRows] = await Promise.all([
 sql`SELECT * FROM pilot_access WHERE LOWER(email) = LOWER(${email}) LIMIT 1`,
 sql`SELECT id, name, email, created_at FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1`,
 ]);

 const pilot = pilotRows[0] ?? null;
 const user = userRows[0] ?? null;
 const userId = user?.id ? String(user.id) : null;

 type Row = Record<string, unknown>;

 const [clicks, views, favorites, cart, orders, storeFavs, retention, pageTypeViews] = await Promise.all([
 userId ? sql`
 SELECT click_id, product_name, store, store_slug, timestamp
 FROM clicks
 WHERE user_id = ${userId}
 ORDER BY timestamp DESC
 LIMIT 500
 ` : Promise.resolve([] as Row[]),

 userId ? sql`
 SELECT pv.product_id, pv.timestamp,
 p.title AS product_name, p.store_name AS store, p.store_slug
 FROM product_views pv
 LEFT JOIN products p ON (p.store_slug || '-' || p.id::text) = pv.product_id
 WHERE pv.user_id = ${userId}
 ORDER BY pv.timestamp DESC
 LIMIT 1000
 ` : Promise.resolve([] as Row[]),

 userId ? sql`
 SELECT
 pf.product_id,
 pf.created_at,
 (pf.product_snapshot->>'title') AS title,
 (pf.product_snapshot->>'image') AS image,
 (pf.product_snapshot->>'store_name') AS store_name,
 (pf.product_snapshot->>'price') AS price,
 (pf.product_snapshot->>'url') AS url
 FROM product_favorites pf
 WHERE pf.user_id = ${userId}
 ORDER BY pf.created_at DESC
 LIMIT 200
 ` : Promise.resolve([] as Row[]),

 userId ? sql`
 SELECT product_id, product_title, product_image, store_name, price, currency, added_at
 FROM user_cart_items
 WHERE user_id = ${userId}
 ORDER BY added_at DESC
 LIMIT 50
 ` : Promise.resolve([] as Row[]),

 userId ? sql`
 SELECT conversion_id, order_id, order_total, currency, store_name, store_slug,
 timestamp, matched_click_data, returned, returned_at
 FROM conversions
 WHERE user_id = ${userId} AND order_total > 0
 ORDER BY timestamp DESC
 LIMIT 50
 ` : Promise.resolve([] as Row[]),

 userId ? sql`
 SELECT store_slug, created_at
 FROM store_favorites
 WHERE user_id = ${userId}
 ORDER BY created_at DESC
 ` : Promise.resolve([] as Row[]),

 userId ? sql`
 SELECT
 MIN(ts) AS first_seen,
 MAX(ts) AS last_seen,
 COUNT(DISTINCT ts::date)::int AS distinct_days
 FROM (
 SELECT timestamp AS ts FROM clicks WHERE user_id = ${userId}
 UNION ALL
 SELECT timestamp FROM product_views WHERE user_id = ${userId}
 UNION ALL
 SELECT created_at FROM product_favorites WHERE user_id = ${userId}
 UNION ALL
 SELECT created_at FROM store_favorites WHERE user_id = ${userId}
 UNION ALL
 SELECT timestamp FROM conversions WHERE user_id = ${userId} AND order_total > 0
 ) a
 ` : Promise.resolve([{ first_seen: null, last_seen: null, distinct_days: 0 }] as Row[]),

 userId ? sql`
 SELECT page_type, full_path, session_id, timestamp, time_on_page_ms
 FROM page_type_views
 WHERE user_id = ${userId}
 ORDER BY timestamp ASC
 LIMIT 3000
 ` : Promise.resolve([] as Row[]),
 ]);

 // Build sessions from ALL activity: store clicks + favorites + cart adds
 const SESSION_GAP_MS = 30 * 60 * 1000;

 type ActivityEvent = {
 ts: number;
 type: "click" | "view" | "favorite" | "cart" | "page";
 label: string;
 store: string;
 storeSlug: string;
 pageType?: string;
 fullPath?: string;
 timeOnPageMs?: number | null;
 };

 function labelForPath(pageType: string | null, fullPath: string | null): string {
 const path = fullPath || "";
 if (path === "/" || pageType === "home") return "Home";
 const storeMatch = path.match(/^\/stores\/([^/]+)(?:\/.*)?$/);
 if (storeMatch) {
 const slug = storeMatch[1];
 const isProduct = /^\/stores\/[^/]+\/.+/.test(path);
 const storeName = slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
 return isProduct ? `Product — ${storeName}` : `Store — ${storeName}`;
 }
 if (pageType === "search" || path.startsWith("/search")) return "Search";
 if (pageType === "profile" || path.startsWith("/profile")) return "Profile";
 if (pageType === "cart" || path.startsWith("/cart")) return "Cart";
 if (path.startsWith("/admin")) return "Admin";
 return pageType || path || "Page";
 }

 const allEvents: ActivityEvent[] = [
 ...clicks.map((c) => ({
 ts: new Date(c.timestamp as string).getTime(),
 type: "click" as const,
 label: c.product_name as string,
 store: c.store as string,
 storeSlug: c.store_slug as string,
 })),
 ...views.map((v) => ({
 ts: new Date(v.timestamp as string).getTime(),
 type: "view" as const,
 label: (v.product_name as string | null) ?? "Unknown product",
 store: (v.store as string | null) ?? "",
 storeSlug: (v.store_slug as string | null) ?? "",
 })),
 ...favorites.map((f) => ({
 ts: new Date(f.created_at as string).getTime(),
 type: "favorite" as const,
 label: (f.title as string | null) ?? "Unknown item",
 store: (f.store_name as string | null) ?? "",
 storeSlug: "",
 })),
 ...cart.map((c) => ({
 ts: new Date(c.added_at as string).getTime(),
 type: "cart" as const,
 label: c.product_title as string,
 store: c.store_name as string,
 storeSlug: "",
 })),
 ...pageTypeViews.map((pv) => ({
 ts: new Date(pv.timestamp as string).getTime(),
 type: "page" as const,
 label: labelForPath(pv.page_type as string | null, pv.full_path as string | null),
 store: "",
 storeSlug: "",
 pageType: pv.page_type as string | undefined,
 fullPath: pv.full_path as string | undefined,
 timeOnPageMs: pv.time_on_page_ms as number | null,
 })),
 ].sort((a, b) => a.ts - b.ts);

 const sessions: {
 start: string;
 end: string;
 durationMs: number;
 clickCount: number;
 viewCount: number;
 favoriteCount: number;
 cartCount: number;
 pageCount: number;
 clicks: { label: string; store: string; storeSlug: string; timestamp: string; type: string; pageType?: string; fullPath?: string; timeOnPageMs?: number | null }[];
 }[] = [];

 let currentBatch: ActivityEvent[] = [];
 for (const event of allEvents) {
 if (currentBatch.length === 0) {
 currentBatch.push(event);
 } else {
 const lastTs = currentBatch[currentBatch.length - 1].ts;
 if (event.ts - lastTs > SESSION_GAP_MS) {
 const start = new Date(currentBatch[0].ts).toISOString();
 const end = new Date(currentBatch[currentBatch.length - 1].ts).toISOString();
 sessions.push({
 start, end,
 durationMs: currentBatch[currentBatch.length - 1].ts - currentBatch[0].ts,
 clickCount: currentBatch.filter((e) => e.type === "click").length,
 viewCount: currentBatch.filter((e) => e.type === "view").length,
 favoriteCount: currentBatch.filter((e) => e.type === "favorite").length,
 cartCount: currentBatch.filter((e) => e.type === "cart").length,
 pageCount: currentBatch.filter((e) => e.type === "page").length,
 clicks: currentBatch.map((e) => ({ label: e.label, store: e.store, storeSlug: e.storeSlug, timestamp: new Date(e.ts).toISOString(), type: e.type, pageType: e.pageType, fullPath: e.fullPath, timeOnPageMs: e.timeOnPageMs })),
 });
 currentBatch = [event];
 } else {
 currentBatch.push(event);
 }
 }
 }
 if (currentBatch.length > 0) {
 const start = new Date(currentBatch[0].ts).toISOString();
 const end = new Date(currentBatch[currentBatch.length - 1].ts).toISOString();
 sessions.push({
 start, end,
 durationMs: currentBatch[currentBatch.length - 1].ts - currentBatch[0].ts,
 clickCount: currentBatch.filter((e) => e.type === "click").length,
 viewCount: currentBatch.filter((e) => e.type === "view").length,
 favoriteCount: currentBatch.filter((e) => e.type === "favorite").length,
 cartCount: currentBatch.filter((e) => e.type === "cart").length,
 pageCount: currentBatch.filter((e) => e.type === "page").length,
 clicks: currentBatch.map((e) => ({ label: e.label, store: e.store, storeSlug: e.storeSlug, timestamp: new Date(e.ts).toISOString(), type: e.type, pageType: e.pageType, fullPath: e.fullPath, timeOnPageMs: e.timeOnPageMs })),
 });
 }

 // Most viewed stores from clicks
 const storeCounts: Record<string, { store: string; storeSlug: string; count: number }> = {};
 for (const c of clicks) {
 const slug = (c.store_slug ?? c.store) as string;
 if (!storeCounts[slug]) storeCounts[slug] = { store: c.store as string, storeSlug: c.store_slug as string, count: 0 };
 storeCounts[slug].count++;
 }
 const topStores = Object.values(storeCounts).sort((a, b) => b.count - a.count).slice(0, 5);

 const ret = retention[0] ?? {};
 const firstSeen = ret.first_seen ? (ret.first_seen instanceof Date ? ret.first_seen.toISOString() : String(ret.first_seen)) : null;
 const lastSeen = ret.last_seen ? (ret.last_seen instanceof Date ? ret.last_seen.toISOString() : String(ret.last_seen)) : null;
 const distinctDays = Number(ret.distinct_days ?? 0);
 const daysSinceLastSeen = lastSeen ? Math.floor((Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24)) : null;

 const totalGmv = (orders as { order_total: number; returned?: boolean }[])
 .filter((o) => !o.returned)
 .reduce((sum, o) => sum + Number(o.order_total), 0);

 // Acquisition source — where this account FIRST found VYA. "direct" isn't a real
 // channel (it's the absence of a detectable one), so we surface the earliest REAL
 // channel (instagram, tiktok, substack, email…) and only fall back to "direct" when
 // that's genuinely all we captured. Form/import names ("waitlist","newsletter",
 // "mailchimp") aren't channels either — they describe HOW the email was captured,
 // so they're shown only as a last resort.
 // Alias resolution comes from app/lib/traffic-source.ts — this file used to carry its
 // own fifth copy of the map. NON_CHANNEL stays local because it is deliberately WIDER
 // than the shared list here: on a single customer's page a form name ("waitlist") is
 // worth showing as a last resort, so it is excluded from "real channel" but not from
 // display.
 const NON_CHANNEL = new Set(["direct", "unknown", "", "waitlist", "newsletter", "mailchimp", "giveaway_modal", "manual", "test", "email-capture"]);
 const norm = (s: string | null | undefined) => (s ? canonicalSource(s) || null : null);
 let acquisitionSource: string | null = null;
 let hadDirect = false;
 if (userId) {
 // Earliest REAL channel across this account's visits (ignore direct/unknown).
 const realRows = await sql`
 SELECT utm_source FROM utm_visits
 WHERE user_id = ${userId} AND utm_source IS NOT NULL
  AND lower(utm_source) NOT IN ('direct','unknown','email')
 ORDER BY timestamp ASC LIMIT 1`;
 acquisitionSource = norm(realRows[0]?.utm_source as string | undefined);
 if (!acquisitionSource) {
 // No social/referrer channel — was there at least an email-link visit, or only direct?
 const anyRows = await sql`SELECT utm_source FROM utm_visits WHERE user_id = ${userId} AND utm_source IS NOT NULL ORDER BY timestamp ASC LIMIT 1`;
 const any = norm(anyRows[0]?.utm_source as string | undefined);
 if (any === "email") acquisitionSource = "email";
 else if (any) hadDirect = true;
 }
 if (!acquisitionSource) {
 const clickRows = await sql`SELECT utm_source FROM clicks WHERE user_id = ${userId} AND utm_source IS NOT NULL AND lower(utm_source) NOT IN ('unknown','direct') ORDER BY timestamp ASC LIMIT 1`;
 acquisitionSource = norm(clickRows[0]?.utm_source as string | undefined);
 }
 }
 if (!acquisitionSource) {
 // Waitlist / email-capture signups never browse signed in. The form name isn't a
 // channel, but surface it (mapped) so it reads as "email list" rather than nothing.
 const wlRows = await sql`SELECT source FROM waitlist WHERE LOWER(email) = LOWER(${email}) LIMIT 1`.catch(() => []);
 const wl = norm(wlRows[0]?.source as string | undefined);
 if (wl && !NON_CHANNEL.has(wl)) acquisitionSource = wl; // a real channel was captured at signup
 else if (wl === "newsletter" || wl === "mailchimp") acquisitionSource = "email list";
 }
 if (!acquisitionSource && pilot?.referred_by) acquisitionSource = "referral";
 // Last resort: we saw them but never a real channel.
 if (!acquisitionSource && hadDirect) acquisitionSource = "direct";

 // ── Visit history ────────────────────────────────────────────────────────
 // Every recorded visit for this account, newest first, so the page can show
 // first-touch vs. every touch after it — "found us on TikTok, came back through
 // Instagram". Only visits made while SIGNED IN carry a user_id, so this is the
 // attributable subset, not necessarily every visit they ever made; the page says so.
 const visitRows = userId
 ? ((await sql`
  SELECT utm_source, utm_medium, utm_campaign, landing_path, timestamp
  FROM utm_visits
  WHERE user_id = ${userId}
  ORDER BY timestamp DESC
  LIMIT 200
 `.catch(() => [])) as { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; landing_path: string | null; timestamp: Date | string }[])
 : [];

 const visits = visitRows.map((v) => ({
 source: normalizeStoredSource(v.utm_source),
 channel: sourceChannel(v.utm_source),
 medium: v.utm_medium ?? null,
 campaign: v.utm_campaign ?? null,
 landingPath: v.landing_path ?? null,
 timestamp: v.timestamp instanceof Date ? v.timestamp.toISOString() : v.timestamp,
 }));

 // One row per distinct source, with how often and when — the "where do they keep
 // coming back from" summary that sits above the raw list.
 const bySource = new Map<string, { source: string; channel: string; visits: number; firstAt: string; lastAt: string }>();
 for (const v of visits) {
 const e = bySource.get(v.source);
 if (!e) {
  bySource.set(v.source, { source: v.source, channel: v.channel, visits: 1, firstAt: v.timestamp, lastAt: v.timestamp });
  continue;
 }
 e.visits += 1;
 if (v.timestamp < e.firstAt) e.firstAt = v.timestamp;
 if (v.timestamp > e.lastAt) e.lastAt = v.timestamp;
 }
 const visitSources = [...bySource.values()].sort((a, b) => b.visits - a.visits);

 return NextResponse.json({
 profile: {
 email,
 name: ([pilot?.first_name, pilot?.last_name].filter(Boolean).join(" ") || user?.name || null),
 phone: pilot?.phone ?? null,
 status: pilot?.status ?? null,
 signedUpAt: pilot?.created_at ?? null,
 approvedAt: pilot?.approved_at ?? null,
 acquisitionSource,
 referralCode: pilot?.referral_code ?? null,
 referredBy: pilot?.referred_by ?? null,
 promoCode: pilot?.promo_code ?? null,
 emailSubscribe: pilot?.email_subscribe ?? false,
 smsSubscribe: pilot?.sms_subscribe ?? false,
 hasAccount: !!userId,
 },
 stats: {
 totalViews: views.length,
 totalClicks: clicks.length,
 totalFavorites: favorites.length,
 totalCartItems: cart.length,
 totalOrders: orders.length,
 totalGmv,
 totalSessions: sessions.length,
 totalBrowseMs: sessions.reduce((sum, s) => sum + s.durationMs, 0),
 },
 retention: {
 firstSeen,
 lastSeen,
 distinctDays,
 daysSinceLastSeen,
 isReturning: distinctDays >= 2,
 },
 visits,
 visitSources,
 // True when the raw list hit the cap, so the UI doesn't imply it's the whole history.
 visitsTruncated: visitRows.length >= 200,
 sessions: sessions.reverse().map((s) => ({
 start: s.start,
 end: s.end,
 durationMs: s.durationMs,
 clickCount: s.clickCount,
 viewCount: s.viewCount,
 favoriteCount: s.favoriteCount,
 cartCount: s.cartCount,
 pageCount: s.pageCount,
 events: s.clicks.map((c) => ({
 type: c.type,
 label: c.label,
 store: c.store,
 storeSlug: c.storeSlug,
 timestamp: c.timestamp,
 pageType: c.pageType,
 fullPath: c.fullPath,
 timeOnPageMs: c.timeOnPageMs,
 })),
 })),
 topStores,
 favorites: favorites.map((f) => ({
 productId: f.product_id,
 title: f.title,
 image: f.image,
 storeName: f.store_name,
 price: f.price,
 url: f.url,
 createdAt: f.created_at instanceof Date ? f.created_at.toISOString() : f.created_at,
 })),
 cart: cart.map((c) => ({
 productId: c.product_id,
 title: c.product_title,
 image: c.product_image,
 storeName: c.store_name,
 price: c.price,
 currency: c.currency,
 addedAt: c.added_at instanceof Date ? c.added_at.toISOString() : c.added_at,
 })),
 orders: orders.map((o) => ({
 conversionId: o.conversion_id,
 orderId: o.order_id,
 orderTotal: Number(o.order_total),
 currency: o.currency,
 storeName: o.store_name,
 storeSlug: o.store_slug,
 timestamp: o.timestamp instanceof Date ? o.timestamp.toISOString() : o.timestamp,
 returned: !!o.returned,
 returnedAt: o.returned_at instanceof Date ? o.returned_at.toISOString() : (o.returned_at ?? null),
 })),
 storeFavorites: storeFavs.map((s) => {
 const storeSlug = s.store_slug as string;
 const storeName = storeList.find((st) => st.slug === storeSlug)?.name ?? storeSlug;
 return {
 storeSlug,
 storeName,
 createdAt: s.created_at instanceof Date ? s.created_at.toISOString() : s.created_at as string,
 };
 }),
 }, { headers: { "Cache-Control": "no-store" } });
}
