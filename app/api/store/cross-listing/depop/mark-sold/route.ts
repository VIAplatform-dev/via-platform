import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getItem, markSold } from "@/app/lib/db/inventory";
import { delistEverywhere } from "@/app/lib/cross-listing-db";
import { creditConsignedSale } from "@/app/lib/consignment-db";

export const dynamic = "force-dynamic";

// ───────────────────────────────────────────────────────────────────────────
// "These items sold on Depop" — from the extension's sold-check.
//
// Our server can't read Depop (Cloudflare), so the extension does it in the seller's own browser:
// it reads their Depop sold items, pulls the VYA ids out of the SKUs the fill step stamped, and posts
// them here. This is the same "sold anywhere → pull everywhere" the eBay cron does, just triggered by
// the browser instead of a schedule, because Depop can only be read from a real logged-in browser.
//
// Idempotent: an item already sold on VYA is skipped, so re-seeing the same Depop sale is a no-op —
// which matters, because the extension will re-report the same sold items every time it runs.
// ───────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Sign into VYA first." }, { status: 401 });

 const body = await request.json().catch(() => null);
 const raw: unknown[] = Array.isArray(body?.itemIds) ? body.itemIds : [];
 // Accept the stamped form ("vya-<id>") or a bare id, and dedupe.
 const itemIds: string[] = Array.from(
  new Set(
   raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim().replace(/^vya-/i, ""))
    .filter(Boolean),
  ),
 );
 if (!itemIds.length) return NextResponse.json({ ok: true, pulled: 0 });

 let pulled = 0;
 const sold: string[] = [];
 for (const itemId of itemIds) {
  const item = await getItem(itemId).catch(() => null);
  if (!item || item.status === "sold") continue; // not ours, or already handled — skip
  await markSold(itemId).catch(() => {});
  await delistEverywhere(itemId, "depop").catch(() => {});
  // Consigned? Credit the consignor. Payout stays manual, same as eBay: Depop paid the seller
  // directly, so there's no routed VYA balance to transfer.
  await creditConsignedSale({ productId: itemId, orderId: `depop-${itemId}`, soldPriceCents: item.priceCents }).catch(() => {});
  sold.push(itemId);
  pulled++;
 }
 return NextResponse.json({ ok: true, pulled, sold });
}
