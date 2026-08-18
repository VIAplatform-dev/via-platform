import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";
import { getSetting } from "@/app/lib/settings-db";
import { stores } from "@/app/lib/stores";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: NextRequest): boolean {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) return false;
 if (request.headers.get("authorization") === `Bearer ${pw}`) return true;
 const tok = request.cookies.get("via_admin_token")?.value;
 return !!tok && tok === crypto.createHash("sha256").update(pw).digest("hex");
}

const canon = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const parseCommission = (v: string) => { const n = parseFloat((v || "").replace(/[^0-9.]/g, "")); return isNaN(n) ? 0 : n; };

// GET — Collabs coverage: for every partnership, compare the order count Collabs reports (from the
// cron snapshot) against the conversions we've actually recorded, per store. Surfaces sales that may be
// sitting unrecorded ("invisible" — like Shiranka's).
//
// IMPORTANT caveat: a store's gap includes orders that PREDATE our tracking. When a partnership is first
// seen we baseline it at its current order count (those orders are already captured by the Shopify order
// webhook, so we don't backfill them here). So `gap` is an UPPER BOUND, not exact loss. A small gap on a
// store we've been recording for a while is the real signal; a large gap usually = pre-tracking history.
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });
 const sql = neon(dbUrl);

 const raw = await getSetting("collabs_data");
 if (!raw) return NextResponse.json({ error: "No collabs_data snapshot found" }, { status: 404 });
 let snap: Array<{ id: string; name: string; totalOrders: number; totalCommissionEarned: string }> = [];
 try { snap = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad snapshot JSON" }, { status: 500 }); }

 // Recorded Collabs conversions, grouped by (canonicalized) store slug.
 const recordedRows = (await sql`
  SELECT store_slug, COUNT(*)::int AS n
  FROM conversions
  WHERE matched_click_data->>'source' LIKE 'shopify-collabs%'
  GROUP BY store_slug
 `) as { store_slug: string; n: number }[];
 const recordedByCanon = new Map<string, number>();
 for (const r of recordedRows) {
  const c = canon(r.store_slug);
  recordedByCanon.set(c, (recordedByCanon.get(c) ?? 0) + r.n);
 }

 const byStore = snap.map((p) => {
  const cfg = stores.find((s) => canon(s.name) === canon(p.name)) ?? stores.find((s) => canon(s.slug) === canon(p.name));
  const key = cfg ? canon(cfg.slug) : canon(p.name);
  const collabsOrders = p.totalOrders ?? 0;
  const recorded = recordedByCanon.get(key) ?? 0;
  return {
   store: cfg?.name ?? p.name,
   slug: cfg?.slug ?? canon(p.name),
   collabsOrders,
   recorded,
   gap: Math.max(0, collabsOrders - recorded),
   commissionUsd: parseCommission(p.totalCommissionEarned),
  };
 }).sort((a, b) => b.gap - a.gap);

 const sum = (f: (r: (typeof byStore)[number]) => number) => byStore.reduce((s, r) => s + f(r), 0);

 return NextResponse.json({
  note: "gap = Collabs-reported orders minus recorded conversions. Includes pre-tracking history (baselined; already captured by the Shopify order webhook), so it's an upper bound — small gaps on actively-tracked stores are the real signal.",
  totals: { collabsOrders: sum((r) => r.collabsOrders), recorded: sum((r) => r.recorded), gap: sum((r) => r.gap) },
  storesWithGap: byStore.filter((r) => r.gap > 0),
 });
}
