import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { reverseImageMatches, matchesToComps, fetchEbaySold, fetchGoogleShopping, fetchComps, rankComps, isCompsConfigured } from "@/app/lib/comps";
import { valueFromComps } from "@/app/lib/price-engine";
import { inferBrandFromTitle } from "@/app/lib/loadStoreProducts";

// Dry-run (CRON_SECRET-gated): for a sample of real products, price each with BOTH the new
// lean path (reverse-image + eBay-sold, Google Shopping only if thin) and the legacy full
// basket (reverse-image + eBay + Shopping + RealReal), and report how far the two prices
// diverge + the SerpApi calls each used. Lets us confirm the lean path is as accurate before
// trusting it. NOTE: makes live SerpApi + Claude calls for each item. Keep the sample small.
//   /api/cron/pricing-compare?slug=lamash&limit=4
export const maxDuration = 300;

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return neon(url);
}

export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 if (!isCompsConfigured()) {
 return NextResponse.json({ error: "comps not enabled (SERPAPI_API_KEY + SERPAPI_ENABLED=true)" }, { status: 400 });
 }

 const url = new URL(request.url);
 const slug = url.searchParams.get("slug");
 const q = url.searchParams.get("q");
 const limit = Math.min(Number(url.searchParams.get("limit") ?? 4), 10);
 if (!slug) return NextResponse.json({ error: "pass ?slug=store-slug (optional ?q=title-substring)" }, { status: 400 });

 const sql = db();
 const rows = (q
 ? await sql`SELECT id, title, image, brand FROM products WHERE store_slug = ${slug} AND title ILIKE ${"%" + q + "%"} AND image IS NOT NULL ORDER BY id DESC LIMIT ${limit}`
 : await sql`SELECT id, title, image, brand FROM products WHERE store_slug = ${slug} AND image IS NOT NULL ORDER BY id DESC LIMIT ${limit}`) as Array<Record<string, unknown>>;

 const items: Array<Record<string, unknown>> = [];
 for (const p of rows) {
 const title = p.title as string;
 const photoUrl = p.image as string;
 const brand = (p.brand as string) || inferBrandFromTitle(title) || null;

 // Reverse-image matches. Shared by both paths (one Google Lens call).
 const reverse = matchesToComps(await reverseImageMatches(photoUrl).catch(() => []));

 // NEW lean path: reverse-image + eBay-sold, Google Shopping only if thin.
 let newComps = rankComps([...reverse, ...(await fetchEbaySold(title).catch(() => []))]);
 let newCalls = 2; // lens + ebay
 if (newComps.length < 5) {
 newComps = rankComps([...newComps, ...(await fetchGoogleShopping(title).catch(() => []))]);
 newCalls = 3;
 }
 const newVal = await valueFromComps(title, photoUrl, newComps.slice(0, 40), { brand });

 // OLD full basket: reverse-image + eBay + Shopping + RealReal.
 const oldComps = rankComps([...reverse, ...(await fetchComps(title).catch(() => []))]).slice(0, 40);
 const oldCalls = 4; // lens + ebay + shopping + realreal
 const oldVal = await valueFromComps(title, photoUrl, oldComps, { brand });

 const np = newVal.marketCents ? Math.round(newVal.marketCents / 100) : null;
 const op = oldVal.marketCents ? Math.round(oldVal.marketCents / 100) : null;
 const diffPct = np != null && op ? Math.round(((np - op) / op) * 100) : null;

 items.push({
 title,
 newPrice: np,
 oldPrice: op,
 diffPct,
 newComps: newComps.length,
 oldComps: oldComps.length,
 newCalls,
 oldCalls,
 });
 }

 const diffs = items.map((i) => (typeof i.diffPct === "number" ? Math.abs(i.diffPct as number) : null)).filter((d): d is number => d != null);
 const avgAbsDiffPct = diffs.length ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : null;
 const callsSaved = items.reduce((a, i) => a + ((i.oldCalls as number) - (i.newCalls as number)), 0);

 return NextResponse.json({ store: slug, count: items.length, avgAbsDiffPct, callsSaved, items });
}
