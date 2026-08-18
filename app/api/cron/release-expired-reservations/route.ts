import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredReservations } from "@/app/lib/db/inventory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Every few minutes: return to sale any item stuck 'reserved' past its 10-minute checkout hold. Without
// this, an abandoned checkout (buyer closes the tab, no Stripe cancel event) strands the piece as
// 'reserved' forever — invisible to other buyers. Vercel Cron sends the CRON_SECRET bearer automatically.
export async function GET(request: NextRequest) {
 if (process.env.CRON_SECRET && request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 try {
 const released = await releaseExpiredReservations();
 if (released) console.log(`[release-expired-reservations] returned ${released} item(s) to sale`);
 return NextResponse.json({ ok: true, released });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "sweep failed" }, { status: 500 });
 }
}
