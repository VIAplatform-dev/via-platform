import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getItem } from "@/app/lib/db/inventory";
import { recordSuggestion, getItemPriceContext } from "@/app/lib/price-suggestions-db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// The AI pricing context for one listing — market value, the quick-sale→top-demand band, the
// rationale sentence and confidence. The one-at-a-time flow keeps this in React state and shows
// it inline; bulk-drafted items had nowhere to keep it, so their editor rendered a bare price box.
// Storing it per item is what lets BOTH surfaces show the same thing.
async function ownedItem(request: NextRequest, id: string) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return null;
 const seller = await getSellerBySlug(slug);
 if (!seller) return null;
 const item = await getItem(id);
 if (!item || item.sellerId !== seller.id) return null;
 return { slug, item };
}

export async function GET(request: NextRequest, { params }: Ctx) {
 const { id } = await params;
 const owned = await ownedItem(request, id);
 if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
 return NextResponse.json({ context: await getItemPriceContext(id) });
}

// POST — attach the estimate the pricing run produced to this item. Called right after a bulk
// draft is created, so the editor can show the same AI context the single-item flow shows.
export async function POST(request: NextRequest, { params }: Ctx) {
 const { id } = await params;
 const owned = await ownedItem(request, id);
 if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const b = await request.json().catch(() => ({}));
 const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
 await recordSuggestion({
  storeSlug: owned.slug,
  itemId: id,
  title: owned.item.title,
  brand: owned.item.brand ?? null,
  category: owned.item.category ?? null,
  suggestedCents: num(b?.suggestedCents),
  marketCents: num(b?.marketCents),
  lowCents: num(b?.lowCents),
  highCents: num(b?.highCents),
  confidence: typeof b?.confidence === "number" ? b.confidence : null,
  source: typeof b?.source === "string" ? b.source : null,
  promptVersion: typeof b?.promptVersion === "string" ? b.promptVersion : null,
  compCount: num(b?.compCount),
  exactPieceCount: num(b?.exactPieceCount),
  rationale: typeof b?.rationale === "string" ? b.rationale : null,
  sellerPriceCents: owned.item.priceCents || null,
 });
 return NextResponse.json({ ok: true });
}
