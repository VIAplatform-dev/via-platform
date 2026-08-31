import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { rehostImage } from "@/app/lib/rehost-images";
import { allPhotosMoved } from "@/app/lib/rehost-images-core";

// Copies imported item images from the seller's old CDN onto OUR Vercel Blob storage,
// in the background — so the listing survives them leaving the old platform, WITHOUT
// making the interactive "bring your site over" import wait on hundreds of uploads.
// Bounded per run + a self-healing `images_rehosted` marker so it never re-scans work
// it already did. Idempotent. Manual run: curl -H "Authorization: Bearer $CRON_SECRET" ...
export const maxDuration = 300;

const BATCH = 20; // items per run — each may re-host several images

export async function GET(request: Request) {
 const secret = process.env.CRON_SECRET;
 const authHeader = request.headers.get("authorization");
 // Header only — a query-string secret leaks into Vercel/CDN access logs and Referer headers.
 if (!secret || authHeader !== `Bearer ${secret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) return NextResponse.json({ error: "No database URL" }, { status: 500 });
 const sql = neon(url);

 // Marker column — self-heal so no migration step is needed.
 await sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS images_rehosted BOOLEAN DEFAULT FALSE`.catch(() => {});

 const rows = (await sql`
  SELECT id, seller_id, images FROM items
  WHERE images_rehosted IS NOT TRUE AND jsonb_array_length(COALESCE(images, '[]'::jsonb)) > 0
  ORDER BY created_at DESC LIMIT ${BATCH}
 `.catch(() => [])) as { id: string; seller_id: string; images: string[] }[];

 let itemsProcessed = 0;
 let imagesRehosted = 0;
 let itemsLeftBehind = 0; // tried, and at least one photo would still go dark — retried next run
 for (const r of rows) {
 const imgs = Array.isArray(r.images) ? r.images : [];
 const out: string[] = [];
 for (const u of imgs) {
 const rehosted = await rehostImage(u, r.seller_id);
 if (rehosted !== u) imagesRehosted++;
 out.push(rehosted);
 }
 // Done means DONE. `rehostImage` returns the original URL on every failure path, so marking the
 // item finished regardless recorded failures as successes — permanently, since the job never
 // revisits a finished item. 429 items across six stores were left with their photos on the
 // seller's platform and a marker saying they had been copied. See allPhotosMoved.
 const done = allPhotosMoved(out);
 await sql`UPDATE items SET images = ${JSON.stringify(out)}::jsonb, images_rehosted = ${done} WHERE id = ${r.id}`.catch(() => {});
 if (!done) itemsLeftBehind++;
 itemsProcessed++;
 }

 const [remaining] = (await sql`
  SELECT COUNT(*)::int n FROM items
  WHERE images_rehosted IS NOT TRUE AND jsonb_array_length(COALESCE(images, '[]'::jsonb)) > 0
 `.catch(() => [{ n: 0 }])) as { n: number }[];

 return NextResponse.json({ ok: true, itemsProcessed, imagesRehosted, itemsLeftBehind, remaining: remaining?.n ?? 0 });
}
