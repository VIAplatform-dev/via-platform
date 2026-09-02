import { NextResponse } from "next/server";
import { listDepopConnectedStores } from "@/app/lib/depop-tokens-db";
import { getRecentDepopSoldSkus, depopConfigured } from "@/app/lib/depop";
import { getItem, markSold } from "@/app/lib/db/inventory";
import { delistEverywhere } from "@/app/lib/cross-listing-db";
import { creditConsignedSale } from "@/app/lib/consignment-db";

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
 const stores = await listDepopConnectedStores();
 const status: Record<string, number> = {};
 let checked = 0;
 let pulled = 0;
 const notes: string[] = [];

 for (const slug of stores) {
  const r = await getRecentDepopSoldSkus(slug, since).catch(() => ({ sales: [], status: "error" as const, detail: "threw" }));
  status[r.status] = (status[r.status] || 0) + 1;
  // One note per distinct problem, not per store — forty stores with the same unmapped endpoint is
  // one fact, and repeating it forty times buries anything else in the response.
  if (r.status !== "ok" && r.detail && !notes.includes(r.detail)) notes.push(r.detail);

  for (const s of r.sales) {
   checked++;
   const item = await getItem(s.sku).catch(() => null);
   if (!item || item.status === "sold") continue;
   await markSold(s.sku).catch(() => {});
   await delistEverywhere(s.sku, "depop").catch(() => {});
   // Consigned? Credit the consignor their split. Payout stays manual for the same reason it does on
   // eBay: Depop paid the seller directly, so there is no routed VYA balance to transfer from.
   await creditConsignedSale({ productId: s.sku, orderId: `depop-${s.orderId}`, soldPriceCents: s.soldPriceCents, channel: "depop" }).catch(() => {});
   pulled++;
  }
 }

 return NextResponse.json({ ok: true, stores: stores.length, checked, pulled, status, notes });
}
