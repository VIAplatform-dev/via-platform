import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

// Read-only: shows the RAW stored price + currency for products (no conversion applied), so we can
// tell whether a wrong marketplace price is bad stored data vs a double-conversion at display time.
function isAuthorized(request: NextRequest): boolean {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) return false;
 if (request.headers.get("authorization") === `Bearer ${pw}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(pw).digest("hex");
}

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { searchParams } = new URL(request.url);
 const slug = searchParams.get("slug") || "blummier";
 const q = searchParams.get("q") || "";
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) return NextResponse.json({ error: "No DB" }, { status: 500 });
 const sql = neon(url);
 const rows = q
 ? await sql`SELECT title, price, currency, compare_at_price, synced_at FROM products WHERE store_slug = ${slug} AND title ILIKE ${"%" + q + "%"} ORDER BY title LIMIT 40`
 : await sql`SELECT title, price, currency, compare_at_price, synced_at FROM products WHERE store_slug = ${slug} ORDER BY synced_at DESC LIMIT 40`;
 const byCurrency = await sql`SELECT COALESCE(currency,'(null)') AS currency, count(*)::int AS n, min(price) AS min_price, max(price) AS max_price FROM products WHERE store_slug = ${slug} GROUP BY currency`;

 // Fetch the live feed SERVER-SIDE (same egress the sync uses) to see the price it actually
 // receives, if this is ~334 (USD) rather than ~245 (GBP), Shopify Markets is localizing and
 // our GBP conversion is the double-count.
 let feedSample: unknown = null;
 if (searchParams.get("feed") === "1") {
 try {
 const domain = searchParams.get("domain") || "blummier.com";
 const r = await fetch(`https://${domain}/products.json?limit=250`, { headers: { "user-agent": "Mozilla/5.0" } });
 const d = await r.json() as { products?: { title: string; variants?: { price?: string }[] }[] };
 const match = (d.products || []).filter((p) => q && p.title.toLowerCase().includes(q.toLowerCase())).slice(0, 6);
 feedSample = match.map((p) => ({ title: p.title, feedPrice: p.variants?.[0]?.price }));
 } catch (e) { feedSample = { error: String(e) }; }
 }
 return NextResponse.json({ slug, rawStoredRows: rows, currencyBreakdown: byCurrency, serverSideFeedSample: feedSample });
}
