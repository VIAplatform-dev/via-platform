import { NextResponse } from "next/server";
import { backfillSizeKeys } from "@/app/lib/size-keys-db";

// Keeps products.size_keys in sync with the derived display size. Runs after the
// daily catalog sync so re-synced items (and any whose fit note changed) get
// fresh, range-expanded size tokens for the list endpoints to filter on.
export const maxDuration = 300;

export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 try {
 // ?full=1 recomputes size_keys for the WHOLE catalog. Used after a size-derivation
 // change (e.g. the shoe-size fix) so the filter tokens match the corrected display.
 // The nightly run (no param) only fills rows that are missing keys.
 const full = new URL(request.url).searchParams.get("full") === "1";
 const result = full
 ? await backfillSizeKeys({ onlyMissing: false })
 : await backfillSizeKeys({ onlyMissing: true, limit: 5000 });
 return NextResponse.json({ ok: true, full, ...result });
 } catch (err) {
 console.error("[cron/backfill-size-keys] failed:", err);
 return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
 }
}
