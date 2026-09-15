import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";
import { getSetting } from "@/app/lib/settings-db";
import { stores } from "@/app/lib/stores";

// Explains a drop in the Shopify Collabs total-commission figure (which is a live mirror of Collabs
// and moves DOWN when an attributed order is refunded/canceled).
//  1. refundCandidatesNow: stores where we have MORE Collabs orders on record (conversions table,
//     never deleted) than Collabs currently reports → an order was removed, i.e. a refund there.
//  2. Records a DATED daily snapshot of every partnership's commission, so from now on a drop is
//     attributed to the exact store day-over-day (the live snapshot setting is single-latest and
//     gets overwritten each sync, so it can't be diffed retroactively).
// Admin-gated (middleware also guards /api/admin/*).

function getDb() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("DATABASE_URL not set");
 return neon(url);
}
function isAuthorized(request: NextRequest): boolean {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) return false;
 if (request.headers.get("authorization") === `Bearer ${pw}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(pw).digest("hex");
}

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const dollars = (s: unknown) => parseFloat(String(s || "").replace(/[^0-9.]/g, "")) || 0;
type Partnership = { name: string; totalOrders?: number; totalLinkVisits?: number; totalCommissionEarned?: string };

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const sql = getDb();

 const raw = await getSetting("collabs_partnerships_snapshot").catch(() => null);
 if (!raw) return NextResponse.json({ error: "No collabs snapshot yet. Open the Shopify Collabs tab / Sync first." }, { status: 404 });
 let parts: Partnership[];
 try { parts = JSON.parse(raw); } catch { return NextResponse.json({ error: "Snapshot unparseable." }, { status: 500 }); }
 if (!Array.isArray(parts)) return NextResponse.json({ error: "Snapshot not an array." }, { status: 500 });

 const liveTotal = Math.round(parts.reduce((s, p) => s + dollars(p.totalCommissionEarned), 0) * 100) / 100;

 // (1) Best-effort culprit finder for orders that dropped OUT of Collabs (full refund/cancel).
 const convRows = (await sql`
  SELECT store_slug, count(*)::int AS n FROM conversions
  WHERE conversion_id LIKE 'collabs_%' AND COALESCE(order_total,0) > 0
  GROUP BY store_slug
 `.catch(() => [])) as { store_slug: string; n: number }[];
 const convMap = new Map(convRows.map((r) => [r.store_slug, r.n]));

 const matchStore = (p: Partnership) => {
 const pn = norm(p.name);
 return stores.find((s) => {
 const cands = [s.name, (s as { affiliatePath?: string }).affiliatePath].filter(Boolean).map((c) => norm(c as string)).filter((c) => c.length >= 3);
 return cands.includes(pn) || cands.some((c) => (pn.includes(c) || c.includes(pn)) && Math.min(pn.length, c.length) >= 4);
 });
 };

 const refundCandidatesNow = parts.map((p) => {
 const store = matchStore(p);
 if (!store) return null;
 const ourStoredOrders = convMap.get(store.slug) || 0;
 const collabsLiveOrders = Number(p.totalOrders) || 0;
 if (ourStoredOrders <= collabsLiveOrders) return null;
 return { partnership: p.name, slug: store.slug, ourStoredOrders, collabsLiveOrders, missingFromCollabs: ourStoredOrders - collabsLiveOrders, liveCommission: dollars(p.totalCommissionEarned) };
 }).filter(Boolean).sort((a, b) => (b!.missingFromCollabs) - (a!.missingFromCollabs));

 // (2) Record today's dated snapshot + diff against the most recent prior day, if any.
 await sql`CREATE TABLE IF NOT EXISTS collabs_commission_daily (snapshot_date DATE NOT NULL, name TEXT NOT NULL, orders INT, commission_usd NUMERIC, PRIMARY KEY (snapshot_date, name))`;
 for (const p of parts) {
 await sql`
  INSERT INTO collabs_commission_daily (snapshot_date, name, orders, commission_usd)
  VALUES (CURRENT_DATE, ${p.name}, ${Number(p.totalOrders) || 0}, ${dollars(p.totalCommissionEarned)})
  ON CONFLICT (snapshot_date, name) DO UPDATE SET orders = EXCLUDED.orders, commission_usd = EXCLUDED.commission_usd
 `.catch(() => {});
 }
 const priorRow = (await sql`SELECT to_char(MAX(snapshot_date),'YYYY-MM-DD') AS d FROM collabs_commission_daily WHERE snapshot_date < CURRENT_DATE`.catch(() => [{ d: null }])) as { d: string | null }[];
 const priorDate = priorRow[0]?.d;
 let commissionDropsSincePrior: unknown[] = [];
 if (priorDate) {
 const prior = (await sql`SELECT name, orders, commission_usd FROM collabs_commission_daily WHERE snapshot_date = ${priorDate}`.catch(() => [])) as { name: string; orders: number; commission_usd: number }[];
 const priorMap = new Map(prior.map((r) => [r.name, r]));
 commissionDropsSincePrior = parts.map((p) => {
 const b = priorMap.get(p.name);
 if (!b) return null;
 const now = dollars(p.totalCommissionEarned), was = Number(b.commission_usd);
 if (now >= was - 0.005) return null;
 return { partnership: p.name, was, now, delta: Math.round((now - was) * 100) / 100, ordersWas: Number(b.orders), ordersNow: Number(p.totalOrders) || 0 };
 }).filter(Boolean);
 }

 return NextResponse.json({
 liveTotalCommission: liveTotal,
 partnerships: parts.length,
 refundCandidatesNow,
 datedSnapshot: {
 savedForToday: true,
 priorDate: priorDate || "none yet",
 commissionDropsSincePrior,
 note: priorDate
 ? "Day-over-day commission drops per partnership."
 : "Baseline recorded for today. Run this again tomorrow (or after the next day's sync) and it will pinpoint any drop to the exact partnership.",
 },
 note: "refundCandidatesNow = stores where our conversions table holds more Collabs orders than Collabs now reports → a refund/cancel removed an order there. Partial refunds that only lower a commission (order kept) won't show here but WILL show in datedSnapshot from the next day onward.",
 });
}
