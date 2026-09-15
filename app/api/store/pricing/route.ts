import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getMinMarkupBps, setMinMarkupBps } from "@/app/lib/store-pricing-db";

export const dynamic = "force-dynamic";

// GET: this store's minimum markup over cost (the pricing floor).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const bps = await getMinMarkupBps(slug);
 return NextResponse.json({ minMarkupBps: bps, minMarkupPct: Math.round(bps / 100) });
}

// POST { minMarkupPct }: set this store's minimum markup (each store sets its own).
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const pct = Number(body?.minMarkupPct);
 if (!Number.isFinite(pct) || pct < 0 || pct > 1000) {
 return NextResponse.json({ error: "Enter a markup between 0% and 1000%." }, { status: 400 });
 }
 const bps = Math.round(pct * 100);
 await setMinMarkupBps(slug, bps);
 return NextResponse.json({ ok: true, minMarkupBps: bps, minMarkupPct: Math.round(pct) });
}
