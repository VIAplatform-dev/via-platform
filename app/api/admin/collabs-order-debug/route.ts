import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";
import { getSetting } from "@/app/lib/settings-db";
import { stores, convertCurrencyToUSD } from "@/app/lib/stores";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// "Why isn't this Collabs order in the conversions table?" — read-only diagnostic + a ?recover=1 mode
// that inserts the missing ones. For a store it fetches the partnership's recent Collabs commissions
// (ALL groups incl. IN_HOLDING_PERIOD) exactly like the sync, groups them by order, and shows which
// orders are in conversions vs MISSING (the ones that slipped past the delta pointer). recover=1 inserts
// the missing ones (deduped by order id). This is scoped to ONE store + a recent window — no mass backfill.
//   /api/admin/collabs-order-debug?store=Lovergirl%20Vintage&days=45            (see the truth)
//   /api/admin/collabs-order-debug?store=Lovergirl%20Vintage&days=45&recover=1  (fix the missing ones)

const COLLABS_GRAPHQL_URL = "https://api.collabs.shopify.com/creator/graphql";

function db() { const url = process.env.DATABASE_URL || process.env.POSTGRES_URL; if (!url) throw new Error("no db"); return neon(url); }
function isAuthorized(request: NextRequest): boolean {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) return false;
 if (request.headers.get("authorization") === `Bearer ${pw}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(pw).digest("hex");
}

// Same brand-name → slug resolution the sync uses, so the partnership match is identical.
const storeNameToSlug = new Map<string, string>(stores.map((s) => [s.name.toLowerCase(), s.slug]));
const slugByNormalized = new Map<string, string>(stores.map((s) => [s.slug.replace(/-/g, ""), s.slug]));
const collabsHandleOverrides: Record<string, string> = { "source 24": "source-twenty-four", "chill boutique consignment": "chill-boutique", "chillboutiqueconsignment": "chill-boutique" };
function resolveStoreSlug(brandName: string): string {
 const key = (brandName || "").toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "").trim();
 if (storeNameToSlug.has(key)) return storeNameToSlug.get(key)!;
 if (collabsHandleOverrides[key]) return collabsHandleOverrides[key];
 const normalized = key.replace(/[^a-z0-9]/g, "");
 if (slugByNormalized.has(normalized)) return slugByNormalized.get(normalized)!;
 return key.replace(/\s+/g, "-");
}

type CollabsCommission = { commissionId: string; orderName: string | null; commissionUsd: number; group: string; earnedAt: string; orderTotalUsd: number | null };

async function fetchPartnershipCommissions(partnershipId: string, cookie: string, csrf: string, sinceIso: string): Promise<CollabsCommission[]> {
 const groups = ["NEXT_PAYOUT", "IN_HOLDING_PERIOD", "PAYOUT_REQUESTED", "CREATOR_ACTION_REQUIRED", "PAID_OUT"];
 const headers = {
  "content-type": "application/json", "cookie": cookie, "x-csrf-token": csrf,
  "origin": "https://collabs.shopify.com", "referer": "https://collabs.shopify.com/", "x-client-type": "web",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
 };
 const body = (group: string) => JSON.stringify({ query: `query { payouts { partnershipCommissions(group: ${group}, partnershipId: "${partnershipId}", first: 50) { nodes { id commissionUsd { amount } earnedAt lineItemTitle order { name total { amount currency } } } } } }` });
 const since = new Date(sinceIso).getTime();
 const out: CollabsCommission[] = [];
 for (const group of groups) {
  try {
   const res = await fetch(COLLABS_GRAPHQL_URL, { method: "POST", headers, body: body(group) });
   const json = await res.json();
   const nodes = (json?.data?.payouts?.partnershipCommissions?.nodes ?? []) as Array<Record<string, unknown>>;
   for (const n of nodes) {
    if (!n.earnedAt || new Date(String(n.earnedAt)).getTime() < since) continue;
    const order = n.order as { name?: string; total?: { amount: number; currency: string } } | undefined;
    const total = order?.total ? convertCurrencyToUSD(order.total.amount, order.total.currency || "USD") : null;
    out.push({
     commissionId: String(n.id), orderName: order?.name ?? null,
     commissionUsd: Number((n.commissionUsd as { amount?: number })?.amount ?? 0),
     group, earnedAt: String(n.earnedAt), orderTotalUsd: total && total > 0 ? total : null,
    });
   }
  } catch { /* skip this group */ }
 }
 return out;
}

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const q = new URL(request.url).searchParams;
 const storeParam = (q.get("store") || "").trim();
 if (!storeParam) return NextResponse.json({ error: "Pass ?store=<name or slug> (e.g. ?store=Lovergirl%20Vintage)" }, { status: 400 });
 const days = Math.max(1, Math.min(120, Number(q.get("days")) || 45));
 const recover = q.get("recover") === "1";
 const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();

 const store = stores.find((s) => s.slug === storeParam.toLowerCase() || s.name.toLowerCase() === storeParam.toLowerCase()) || stores.find((s) => s.slug === resolveStoreSlug(storeParam));
 const slug = store?.slug || resolveStoreSlug(storeParam);
 const storeName = store?.name || storeParam;
 const sql = db();

 try {
  const ourConversions = Number(((await sql`SELECT count(*)::int AS n FROM conversions WHERE store_slug = ${slug} AND conversion_id LIKE 'collabs_%'`) as Array<{ n: number }>)[0]?.n ?? 0);

  // Find the partnership in the last synced Collabs snapshot.
  const raw = await getSetting("collabs_data").catch(() => null);
  let partnership: { id: string; name: string; totalOrders?: number; totalCommissionEarned?: string; commissionRules?: Array<{ value: number }> } | null = null;
  if (raw) {
   try { const arr = JSON.parse(raw) as Array<{ id: string; name: string; totalOrders?: number; totalCommissionEarned?: string; commissionRules?: Array<{ value: number }> }>; partnership = arr.find((p) => resolveStoreSlug(p.name) === slug) ?? null; } catch { /* ignore */ }
  }
  if (!partnership) {
   return NextResponse.json({ store: slug, storeName, ourConversions, error: `No Collabs partnership resolves to '${slug}'. Either the store name doesn't match Collabs (add a collabsHandleOverride) or the snapshot is empty — open/sync the Collabs tab first.` });
  }

  const [cookie, csrf] = await Promise.all([getSetting("collabs_cookie"), getSetting("collabs_csrf_token")]);
  if (!cookie || !csrf) return NextResponse.json({ store: slug, storeName, ourConversions, collabsTotalOrders: partnership.totalOrders ?? null, error: "Collabs session missing (cookie/csrf). Sync the Collabs tab to refresh it, then retry." });

  const commissions = await fetchPartnershipCommissions(partnership.id, cookie, csrf, sinceIso);
  // Group commission line items by order.
  const byOrder = new Map<string, CollabsCommission[]>();
  for (const c of commissions) { const key = c.orderName || `commission-${c.commissionId}`; const g = byOrder.get(key) ?? []; g.push(c); byOrder.set(key, g); }

  const rate = Number(partnership.commissionRules?.[0]?.value) || null; // % — for back-calc when Collabs gives no order total
  const rows: Array<{ orderName: string | null; orderId: string; group: string; commissionUsd: number; orderTotalUsd: number | null; earnedAt: string; inConversions: boolean }> = [];
  for (const [, items] of byOrder) {
   const orderName = items[0].orderName;
   const orderId = orderName ? `collabs-${slug}-${orderName.replace(/^#/, "")}` : `collabs-commission-${items[0].commissionId}`;
   const exists = ((await sql`SELECT 1 FROM conversions WHERE store_slug = ${slug} AND order_id = ${orderId} LIMIT 1`) as unknown[]).length > 0;
   const commissionUsd = Math.round(items.reduce((s, i) => s + i.commissionUsd, 0) * 100) / 100;
   const orderTotalUsd = items.find((i) => i.orderTotalUsd)?.orderTotalUsd ?? (rate ? Math.round((commissionUsd / (rate / 100)) * 100) / 100 : null);
   rows.push({ orderName, orderId, group: items[0].group, commissionUsd, orderTotalUsd, earnedAt: items[0].earnedAt, inConversions: exists });
  }
  rows.sort((a, b) => (a.earnedAt < b.earnedAt ? 1 : -1));
  const missing = rows.filter((r) => !r.inConversions);

  // ── recover=1 — insert the missing orders (deduped by order id). Only ones with a resolvable total. ──
  const recovered: Array<{ orderName: string | null; orderId: string; orderTotalUsd: number; commissionUsd: number }> = [];
  if (recover) {
   for (let i = 0; i < missing.length; i++) {
    const m = missing[i];
    if (!m.orderTotalUsd || m.orderTotalUsd <= 0) continue;
    const convId = `collabs_recover_${slug}_${new Date(m.earnedAt).getTime()}_${i}`;
    await sql`
     INSERT INTO conversions (conversion_id, timestamp, order_id, order_total, currency, items, via_click_id, store_slug, store_name, matched, matched_click_data)
     VALUES (${convId}, ${m.earnedAt}, ${m.orderId}, ${m.orderTotalUsd}, 'USD',
      ${JSON.stringify([{ productName: "Item via Shopify Collabs", quantity: 1, price: m.orderTotalUsd }])},
      null, ${slug}, ${storeName}, true, ${JSON.stringify({ source: "manual-recover", group: m.group, commissionUsd: m.commissionUsd })})
     ON CONFLICT (order_id, store_slug) DO NOTHING
    `.catch(() => {});
    recovered.push({ orderName: m.orderName, orderId: m.orderId, orderTotalUsd: m.orderTotalUsd, commissionUsd: m.commissionUsd });
   }
  }

  return NextResponse.json({
   store: slug, storeName,
   collabsTotalOrders: partnership.totalOrders ?? null, // what Collabs says (all-time)
   ourCollabsConversions: ourConversions,               // what we've recorded
   windowDays: days,
   recentCollabsOrders: rows.length,                    // orders Collabs shows in the window
   alreadyInConversions: rows.filter((r) => r.inConversions).length,
   missingCount: missing.length,                        // in Collabs but NOT in our table — the culprits
   missing,                                             // each with orderId, group (holding?), commission, total
   ...(recover ? { recovered, recoveredCount: recovered.length } : { hint: "add &recover=1 to insert the missing ones" }),
  });
 } catch (e) {
  return NextResponse.json({ error: String(e) }, { status: 500 });
 }
}
