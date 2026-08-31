import { NextRequest, NextResponse } from "next/server";
import { indexItems } from "@/app/lib/market/embeddings-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// Hourly: embed the first photo of every sellable item that doesn't have a current vector, so
// Market Mode's camera can find it. Bounded per run; the backlog drains across runs.
export async function GET(request: NextRequest) {
 if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 try {
 const r = await indexItems(null, 96);
 if (r.attempted) console.log(`[embed-item-index] ${JSON.stringify(r)}`);
 return NextResponse.json({ ok: true, ...r });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "index failed" }, { status: 500 });
 }
}
