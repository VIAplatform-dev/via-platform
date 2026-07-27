import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getAttribution, getChannelTrend } from "@/app/lib/audience-db";
import { getTrafficSources, getTopPages } from "@/app/lib/store-visits-db";

export const dynamic = "force-dynamic";

const EMPTY = { rows: [], totals: { clicks: 0, orders: 0, sales: 0, convPct: 0, aov: 0 }, newCustomers: 0, returningCustomers: 0 };
const EMPTY_TRAFFIC = { total: 0, byType: [], topSources: [] };
const EMPTY_PAGES = { total: 0, byType: [], pages: [] };

// GET — where this store's visitors come from (traffic sources, referrer-classified) PLUS click
// attribution + trend. ?days=30 (default) | all. Per-store — everything is scoped to the slug.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const raw = new URL(request.url).searchParams.get("days");
 const days = raw === "all" ? undefined : Number(raw) || 30;
 const [data, trend, traffic, topPages] = await Promise.all([
 getAttribution(slug, days).catch(() => EMPTY),
 getChannelTrend(slug, days ?? 90).catch(() => ({ days: [], series: [] })),
 getTrafficSources(slug, days).catch(() => EMPTY_TRAFFIC),
 getTopPages(slug, days).catch(() => EMPTY_PAGES),
 ]);
 return NextResponse.json({ ok: true, days: days ?? "all", ...data, trend, traffic, topPages });
}
