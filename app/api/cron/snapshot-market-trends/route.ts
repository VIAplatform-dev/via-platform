import { NextResponse } from "next/server";
import { getBrandHeatIndex } from "@/app/lib/brand-heat-db";
import { captureMarketTrends, isMarketTrendsConfigured } from "@/app/lib/market-trends";
import { captureInstagramBuzz, igConfigured } from "@/app/lib/instagram";
import { capturePinterestTrends, isPinterestConfigured } from "@/app/lib/pinterest-trends";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily: fetch Google Search interest + eBay sold data for the trending brands and PERSIST snapshots
// to Postgres, so the Trends tab reads from the database (with history for momentum) rather than
// calling SerpApi on every page view. Dormant until SERPAPI_ENABLED=true.
// Manual first run allowed via ?key=<CRON_SECRET> so you can populate it right after enabling.
export async function GET(request: Request) {
 const cronSecret = process.env.CRON_SECRET;
 const url = new URL(request.url);
 const authed = request.headers.get("authorization") === `Bearer ${cronSecret}` || (cronSecret && url.searchParams.get("key") === cronSecret);
 if (!cronSecret || !authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 // SerpApi (Google + eBay), Instagram, and Pinterest are independent — run whichever is configured.
 if (!isMarketTrendsConfigured() && !igConfigured() && !isPinterestConfigured()) {
 return NextResponse.json({ ok: true, skipped: "No external sources enabled (set SERPAPI_ENABLED=true, IG_ACCESS_TOKEN, and/or PINTEREST_ACCESS_TOKEN).", google: 0, resale: 0, instagram: 0, pinterest: 0 });
 }

 // Pinterest needs no brand list — it returns the top growing fashion keywords globally, so capture
 // it independently (it's the "what's rising in culture" signal, not a per-brand lookup).
 const pinterest = isPinterestConfigured()
 ? await capturePinterestTrends().catch((e) => { console.error("snapshot-market-trends (pinterest):", e); return 0; })
 : 0;

 // The brands worth tracking externally: the top of VYA's own demand index.
 const heat = await getBrandHeatIndex(30, 24).catch(() => ({ brands: [] as { brand: string }[] }));
 const brands = (heat.brands as { brand: string }[]).map((b) => b.brand).filter(Boolean);
 if (!brands.length) return NextResponse.json({ ok: true, message: "No brands to snapshot yet.", google: 0, resale: 0, instagram: 0, pinterest });

 const [saved, instagram] = await Promise.all([
 isMarketTrendsConfigured()
 ? captureMarketTrends(brands).catch((e) => { console.error("snapshot-market-trends (serpapi):", e); return { google: 0, resale: 0 }; })
 : Promise.resolve({ google: 0, resale: 0 }),
 igConfigured()
 ? captureInstagramBuzz(brands).catch((e) => { console.error("snapshot-market-trends (instagram):", e); return 0; })
 : Promise.resolve(0),
 ]);
 return NextResponse.json({ ok: true, brands: brands.length, ...saved, instagram, pinterest });
}
