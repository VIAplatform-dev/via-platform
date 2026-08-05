import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getBrandHeatIndex, getCategoryHeat, getBrandTrend } from "@/app/lib/brand-heat-db";
import { getGoogleTrends, getResaleMarket, isMarketTrendsConfigured } from "@/app/lib/market-trends";
import { getInstagramBuzz, igConfigured } from "@/app/lib/instagram";
import { getTopColors } from "@/app/lib/data-layer/market-metrics-db";

export const dynamic = "force-dynamic";

type Play = { brand: string; action: "source" | "price" | "watch" | "cool"; reason: string; suggestedPriceCents: number | null; carried: boolean };
const fmtK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`);
const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

// Read all four signals together (VYA demand + Google search + eBay resale volume/price) and turn
// them into one call per brand: what to source, how to price, what to ease off. This is the layer
// that makes the tab actionable rather than four disconnected lists of numbers.
function buildPlaybook(
 rising: { brand: string; momentumPct: number | null }[],
 google: { brand: string; momentumPct: number | null; avgInterest: number }[],
 resale: { brand: string; soldCount: number; medianPriceCents: number | null }[],
 buzz: { brand: string; momentumPct: number | null }[],
 carriedBrands: string[],
): Play[] {
 const carried = new Set(carriedBrands.map((b) => b.toLowerCase()));
 const gMap = new Map(google.map((g) => [g.brand.toLowerCase(), g]));
 const rMap = new Map(resale.map((r) => [r.brand.toLowerCase(), r]));
 const bMap = new Map(buzz.map((b) => [b.brand.toLowerCase(), b]));
 const plays: Play[] = [];
 for (const b of rising) {
 const key = b.brand.toLowerCase();
 const g = gMap.get(key);
 const r = rMap.get(key);
 const igMom = bMap.get(key)?.momentumPct ?? null;
 const buzzing = igMom != null && igMom >= 25; // social surging — a LEADING signal
 const buzzNote = buzzing ? ` 🔥 Gaining fast on Instagram (+${Math.round(igMom!)}%).` : "";
 // VYA demand + eBay resale volume are the HARD signals (your buyers, real transactions). Google
 // is supplementary: it CONFIRMS a rise, but a quiet brand-name search never downgrades a brand
 // that's hot on VYA with a real resale market — search lags resale for niche/archival labels.
 const vya = b.momentumPct;
 const gi = g?.avgInterest ?? null;
 const gMom = g?.momentumPct ?? null;
 const sold = r?.soldCount ?? null;
 const median = r?.medianPriceCents ?? null;
 const price = median ? money(median) : null;
 const deep = sold != null && sold >= 40000; // deep, liquid resale market
 const realMarket = sold != null && sold >= 5000; // a real resale market (smaller)
 const thinMarket = sold != null && sold < 5000; // barely any resale off-platform
 const vyaHot = vya != null && vya >= 20;
 const vyaCool = vya != null && vya <= -15;
 const gConfirms = gMom != null && gMom >= 15; // search rising too
 const gQuiet = gi != null && gi < 12; // brand-name search is quiet (often noise for niche labels)

 let action: Play["action"]; let reason: string;
 if (vyaCool && (thinMarket || (gMom != null && gMom < 0))) {
 action = "cool";
 reason = `Cooling — demand is sliding on VYA (${Math.round(vya!)}%)${gMom != null && gMom < 0 ? ` and in search (${Math.round(gMom)}%)` : ""}. Don't over-source${price ? `; move what you hold at or below ${price}` : ""}.`;
 } else if (vyaHot && (deep || realMarket)) {
 action = "source";
 const conf = gConfirms ? " Google search confirms it's climbing off-platform too." : gQuiet ? " (Brand-name search is quiet — normal for niche/archival labels — but your demand and real eBay sales say it's moving.)" : "";
 reason = `Source now — surging on VYA (+${Math.round(vya!)}%) with a ${deep ? "deep" : "real"} resale market (${fmtK(sold!)} sold${price ? ` ~${price}` : ""}).${conf}${buzzNote} Stock it${price ? `; list near ${price}` : ""}.`;
 } else if (vyaHot && thinMarket && buzzing) {
 // Leading indicator: hot with your shoppers AND surging on Instagram before eBay volume catches
 // up. This is the "get ahead of it" call — exactly the surge price/search signals miss early.
 action = "source";
 reason = `Emerging — hot on VYA (+${Math.round(vya!)}%) and surging on Instagram (+${Math.round(igMom!)}%) while resale volume's still thin. Social leads resale — get ahead of it: source a few and list early${price ? ` around ${price}` : ""}.`;
 } else if (vyaHot && thinMarket) {
 action = "watch";
 reason = `Hot on VYA only — spiking with your shoppers (+${Math.round(vya!)}%) but almost nothing's selling on eBay (${fmtK(sold!)}). Sell here now; don't source deep for outside resale.`;
 } else if (deep && price) {
 action = "price";
 reason = `Reliable mover — ${fmtK(sold!)} sold, clearing ~${price}. Safe to stock; anchor your price at ${price}${vyaHot ? ", and test a touch above since VYA demand's rising" : gMom != null && gMom < -10 ? " (search softening — don't overpay to source)" : ""}.${buzzNote}`;
 } else if (buzzing) {
 action = "watch";
 reason = `One to watch — gaining fast on Instagram (+${Math.round(igMom!)}%)${vya != null ? `, VYA ${vya > 0 ? "+" : ""}${Math.round(vya)}%` : ""}. Social's moving before the resale market; keep an eye on it.`;
 } else {
 action = "watch";
 reason = `Mixed signal${vya != null ? ` — VYA ${vya > 0 ? "+" : ""}${Math.round(vya)}%` : ""}${sold != null ? `, ${fmtK(sold)} sold on eBay` : ""}${price ? ` ~${price}` : ""}. No clear move yet.`;
 }

 let suggested = median;
 if (median && vyaHot) suggested = Math.round(median * 1.08);
 else if (median && vyaCool) suggested = Math.round(median * 0.92);

 plays.push({ brand: b.brand, action, reason, suggestedPriceCents: suggested, carried: carried.has(key) });
 }
 const order = { source: 0, price: 1, watch: 2, cool: 3 };
 return plays.sort((a, b) => (order[a.action] - order[b.action]) || (Number(b.carried) - Number(a.carried))).slice(0, 8);
}

// Trend intelligence for a store: marketplace-wide demand momentum (the Brand Heat
// Index) + how the store's OWN inventory brands are trending — to guide sourcing and
// pricing. Aggregate/anonymized: it never exposes any individual store's numbers.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const [heat, categories, topColors] = await Promise.all([
 getBrandHeatIndex(30, 12).catch(() => ({ generatedAt: "", periodDays: 30, brands: [] })),
 getCategoryHeat(30, 8).catch(() => []),
 getTopColors("30d", 6).catch(() => []),
 ]);

 // The store's own inventory brands, and how each is trending on VYA.
 let yourBrands: { brand: string; rank: number; momentumPct: number | null; trending: boolean; note: string }[] = [];
 try {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (url) {
 const sql = neon(url);
 const rows = (await sql`
  SELECT DISTINCT COALESCE(NULLIF(i.brand, ''), '') AS brand
  FROM items i JOIN sellers s ON s.id = i.seller_id
  WHERE s.slug = ${slug} AND i.brand IS NOT NULL AND i.brand <> ''
  LIMIT 24
 `.catch(() => [])) as { brand: string }[];
 const trends = await Promise.all(rows.map((r) => getBrandTrend(r.brand).catch(() => null)));
 yourBrands = trends.filter((t): t is NonNullable<typeof t> => !!t).sort((a, b) => a.rank - b.rank);
 }
 } catch { /* best effort */ }

 // External signal: real Google Search momentum for the trending brands (+ the store's own),
 // so the tab reflects the whole resale market, not just VYA. Dormant until SerpApi is enabled.
 const brandNames = [...new Set([
 ...(heat.brands as { brand: string }[]).map((b) => b.brand),
 ...yourBrands.map((b) => b.brand),
 ].filter(Boolean))].slice(0, 20);
 // Read the persisted snapshots (populated daily by the snapshot-market-trends cron) — no live
 // SerpApi call on page view.
 const [googleTrends, resaleMarket, igBuzz] = await Promise.all([
 getGoogleTrends(brandNames).catch(() => []),
 getResaleMarket(brandNames).catch(() => []),
 getInstagramBuzz(brandNames).catch(() => []),
 ]);

 const playbook = buildPlaybook(
 (heat.brands as { brand: string; momentumPct: number | null }[]),
 googleTrends as { brand: string; momentumPct: number | null; avgInterest: number }[],
 resaleMarket as { brand: string; soldCount: number; medianPriceCents: number | null }[],
 igBuzz as { brand: string; momentumPct: number | null }[],
 yourBrands.map((b) => b.brand),
 );

 return NextResponse.json({
 ok: true,
 generatedAt: heat.generatedAt,
 rising: heat.brands,
 categories,
 topColors,
 yourBrands,
 googleTrends,
 resaleMarket,
 igBuzz,
 playbook,
 webConfigured: isMarketTrendsConfigured(),
 socialConfigured: igConfigured(),
 });
}
