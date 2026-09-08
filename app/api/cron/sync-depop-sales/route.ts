import { NextResponse } from "next/server";
import { depopConfigured } from "@/app/lib/depop";
import { syncAllStores } from "@/app/lib/market-sync";

// Depop sale-sync — the other half of "sold anywhere → pull everywhere". Polls each connected
// store's recent Depop sales; when a piece sold on Depop (SKU = our itemId), marks it sold on VYA
// and delists it elsewhere so it can't double-sell, and credits the consignor if it was consigned.
// Idempotent: a piece already sold on VYA is skipped, so re-seeing the same Depop sale is a no-op.
//
// Deliberately the FIRST piece of Depop work to ship. It is the oversell fix — the thing that costs a
// seller a real customer when it's missing — and it pays off the moment any credential exists,
// however that credential was obtained. Nothing here depends on posting TO Depop working.
//
// It reports per-store status rather than swallowing failures, because right now the interesting
// output is diagnostic: `unmapped` means we haven't found Depop's sold-items endpoint yet, and
// `unauthorized` means we have but the session is dead. Those are very different problems and a
// bare "0 pulled" would hide both.
export const maxDuration = 300;

export async function GET(request: Request) {
 const authHeader = request.headers.get("authorization");
 const cronSecret = process.env.CRON_SECRET;
 if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 if (!depopConfigured()) return NextResponse.json({ ok: true, skipped: "depop not configured" });

 // Look back 6h so nothing slips between hourly runs; re-seen sales are no-ops (item already sold).
 const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
 // The loop itself lives in lib/market-sync so checkout can run the same sync on demand for one
 // store — the cron is the backstop, not the only line of defence against a double sale.
 const r = await syncAllStores("depop", since);
 return NextResponse.json({ ok: true, stores: r.stores, checked: r.checked, pulled: r.pulled.length, notes: r.notes });
}
