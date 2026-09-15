import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getStoreAnalytics } from "@/app/lib/store-analytics-db";

export const dynamic = "force-dynamic";

// GET ?days=30|90|all: the acting store's own business analytics.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const raw = new URL(request.url).searchParams.get("days");
 const days = raw === "all" ? null : Math.max(1, Math.min(3650, Number(raw) || 30));
 try {
 return NextResponse.json({ ok: true, ...(await getStoreAnalytics(slug, days)) });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
 }
}
