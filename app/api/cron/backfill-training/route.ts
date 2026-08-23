import { NextResponse } from "next/server";
import { backfillFromItems, backfillFromProducts, backfillFromSold, getTrainingStats } from "@/app/lib/training-data-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Keeps the training dataset (and therefore the reference index) complete WITHOUT anyone clicking a
// button: every VYA inventory item + marketplace product not already captured is folded in. Idempotent
// (INSERT ... ON CONFLICT DO NOTHING), so re-running only ever adds the new ones. The embed-reference-
// index cron then embeds the fresh rows, so a listing goes from published → tracked → searchable on its
// own. Manual run: curl -H "Authorization: Bearer $CRON_SECRET" ...
export async function GET(request: Request) {
 const cronSecret = process.env.CRON_SECRET;
 // Header only — a query-string secret leaks into Vercel/CDN access logs and Referer headers.
 const authed = request.headers.get("authorization") === `Bearer ${cronSecret}`;
 if (!cronSecret || !authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 try {
 const [items, products, sold] = await Promise.all([backfillFromItems().catch(() => 0), backfillFromProducts().catch(() => 0), backfillFromSold().catch(() => 0)]);
 return NextResponse.json({ ok: true, added: { items, products, sold }, stats: await getTrainingStats() });
 } catch (e) {
 return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
