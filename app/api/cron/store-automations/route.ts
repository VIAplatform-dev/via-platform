import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { sendNewListingsDigest } from "@/app/lib/automation-engine";
import { sendStoreNewArrivals } from "@/app/lib/email";
import { resolveStoreSender } from "@/app/lib/email-settings-db";

export const maxDuration = 300;

// Daily: for each store that published new listings in the last 24h, send a single
// new-arrivals digest to its subscribed customers — if "new arrivals" (built-in) or a
// custom "new_listing" automation is on. Batched, so a whole drop is one email.
export async function GET(request: Request) {
 const { searchParams } = new URL(request.url);
 const testEmail = searchParams.get("testEmail");
 const testSlug = searchParams.get("slug");
 const cronSecret = process.env.CRON_SECRET;
 // The secret is required unconditionally — testEmail is just which mode of an already-
 // authenticated call this is, never a way to skip authentication. (Previously `!testEmail &&`
 // let anyone bypass the secret entirely by passing any testEmail value, turning this into an
 // open, unauthenticated email relay off our sending domain.)
 if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });
 const sql = neon(dbUrl);

 // Test send: pick a store (given slug, else the one with the most photographed pieces lately) and
 // send that store's new-arrivals email to just the test address.
 if (testEmail) {
 // The native `items` table is empty in this env; source the preview from the marketplace
 // `products` table (real pieces with photos) so the pretty grid email can be seen.
 type PRow = { slug: string; id: number; title: string; price: number | string | null; currency: string | null; image: string | null };
 let prows: PRow[];
 try {
 prows = (testSlug
 ? await sql`SELECT store_slug AS slug, id, title, price, currency, image FROM products
   WHERE image IS NOT NULL AND image <> '' AND title NOT ILIKE '%gift card%' AND store_slug = ${testSlug}
   ORDER BY synced_at DESC NULLS LAST LIMIT 40`
 : await sql`SELECT store_slug AS slug, id, title, price, currency, image FROM products
   WHERE image IS NOT NULL AND image <> '' AND title NOT ILIKE '%gift card%'
   ORDER BY synced_at DESC NULLS LAST LIMIT 300`) as PRow[];
 } catch (e) {
 return NextResponse.json({ ok: false, error: "query failed: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
 }
 if (!prows.length) return NextResponse.json({ ok: false, error: testSlug ? `No photographed products for ${testSlug}.` : "No photographed products found." }, { status: 404 });
 // Pick the store with the most photographed pieces for a full grid.
 let slug = testSlug || "";
 if (!slug) { const counts: Record<string, number> = {}; for (const r of prows) counts[r.slug] = (counts[r.slug] || 0) + 1; slug = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]; }
 const sender = await resolveStoreSender(slug);
 const products = prows.filter((r) => r.slug === slug).slice(0, 12).map((r) => ({
 title: r.title, image: r.image, priceCents: Math.round(Number(r.price) * 100) || 0, currency: r.currency || "USD",
 url: `https://vyaplatform.com/products/${slug}-${r.id}`,
 }));
 const res = await sendStoreNewArrivals({
 storeName: sender.fromName, storeEmail: sender.replyTo, fromAddress: sender.fromAddress,
 subject: `New arrivals from ${sender.fromName}`, intro: "Fresh one-of-one pieces just landed. Shop them before they’re gone.",
 products, shopUrl: `https://vyaplatform.com/stores/${slug}`, recipients: [testEmail],
 }).catch(() => null);
 return NextResponse.json({ ok: true, test: true, slug, products: products.length, sent: res?.sent ?? 0 });
 }

 // Newly published pieces per store in the last day — with photo + price for a real email.
 const rows = (await sql`
  SELECT s.slug AS slug, i.id AS id, i.title AS title, i.price_cents AS price_cents,
   i.currency AS currency, i.images AS images
  FROM items i JOIN sellers s ON s.id = i.seller_id
  WHERE i.created_at >= now() - interval '24 hours' AND i.status = 'active' AND i.title IS NOT NULL
  ORDER BY s.slug
 `.catch(() => [])) as { slug: string; id: string; title: string; price_cents: number; currency: string | null; images: unknown }[];

 const firstImg = (imgs: unknown): string | null => { const a = Array.isArray(imgs) ? imgs : (typeof imgs === "string" ? (() => { try { return JSON.parse(imgs); } catch { return []; } })() : []); return (Array.isArray(a) && typeof a[0] === "string") ? a[0] : null; };
 const byStore = new Map<string, { id: string; title: string; image: string | null; priceCents: number; currency: string }[]>();
 for (const r of rows) {
 const arr = byStore.get(r.slug) || [];
 arr.push({ id: r.id, title: r.title, image: firstImg(r.images), priceCents: r.price_cents || 0, currency: r.currency || "USD" });
 byStore.set(r.slug, arr);
 }

 let storesEmailed = 0, totalSent = 0;
 for (const [slug, items] of byStore) {
 const res = await sendNewListingsDigest(slug, items).catch(() => null);
 if (res && res.sent > 0) { storesEmailed++; totalSent += res.sent; }
 }

 return NextResponse.json({ ok: true, storesWithNewListings: byStore.size, storesEmailed, totalSent });
}
