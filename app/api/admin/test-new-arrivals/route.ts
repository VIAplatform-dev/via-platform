import { NextRequest, NextResponse } from "next/server";
import { sendNewArrivalsEmail, NEW_ARRIVALS_SUBJECT_KEY } from "@/app/lib/email";
import { getSetting } from "@/app/lib/settings-db";
import { getEmailPickProducts } from "@/app/lib/editors-picks-db";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";
import type { DBProduct } from "@/app/lib/db";

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const to = request.nextUrl.searchParams.get("to") ?? "hana@vyaplatform.com";

 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 const sql = neon(url!);

 const rows = await sql`
 SELECT id, title, price, currency, image, images, store_name, store_slug,
 external_url, description, variant_id, shopify_product_id,
 collabs_link, size, compare_at_price, insider_notified, synced_at, created_at
 FROM products
 WHERE image IS NOT NULL
 ORDER BY created_at DESC NULLS LAST
 LIMIT 12
 `;

 // Mirror the real send: use the hand-curated email picks if any exist,
 // otherwise the 12 newest as a representative sample.
 const picks = await getEmailPickProducts();
 const usingPicks = picks.length > 0;
 const products = usingPicks ? picks : (rows as unknown as DBProduct[]);

 const { sent, failed } = await sendNewArrivalsEmail([to], products, usingPicks, await getSetting(NEW_ARRIVALS_SUBJECT_KEY).catch(() => null));
 return NextResponse.json({ ok: true, sent, failed, to, productCount: products.length, source: usingPicks ? "curated-picks" : "newest-12" });
}
