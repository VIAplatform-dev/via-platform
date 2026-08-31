import { NextRequest } from "next/server";
import { addToCart, getCartItemIds } from "@/app/lib/storefront-cart-db";
import { findItemByVariantId, isSellable } from "@/app/lib/plan-b/lookup";
import { variantIdFromAddBody, toCartLine } from "@/app/lib/plan-b/cart-json";
import { resolveStore, cartToken, cartResponse, errorResponse, readBody, withCartCookie, cartLines } from "@/app/lib/plan-b/cart-session";
import { buildCartSectionsResponse, requestedSectionIds } from "@/app/lib/plan-b/cart-sections-response";

export const dynamic = "force-dynamic";

// POST /cart/add.js — the seller's OWN Add-to-cart button, driving VYA's database.
//
// The theme posts a Shopify variant id because that's what it was captured with; `sourceVariantId`
// on every imported item maps it straight back to a VYA piece. Shopify answers this endpoint with
// the ADDED LINE (not the whole cart), and themes read that response to render their drawer — so the
// shape matters as much as the effect.
export async function POST(request: NextRequest) {
 const store = await resolveStore(request);
 if (!store) return errorResponse("Unknown store.", 404);

 const body = await readBody(request);
 const variantId = variantIdFromAddBody(body);
 if (!variantId) return errorResponse("No item was specified.", 400);

 const item = await findItemByVariantId(store.sellerId, variantId);
 if (!item) return errorResponse("That item is no longer available.", 404);
 // One-of-one: a sold piece is gone, not backorderable. Say so in the theme's own error shape
 // rather than adding a line the shopper can't actually buy.
 if (!isSellable(item)) return errorResponse(`${item.title} has sold.`, 422);

 const { token, isNew } = cartToken(request);
 await addToCart(token, item.id, item.sellerId);
 const itemCount = (await getCartItemIds(token).catch(() => [item.id])).length;

 const line = toCartLine({
  id: item.id, title: item.title, priceCents: item.priceCents, currency: item.currency,
  image: item.images?.[0] ?? null, handle: item.sourceId, sourceVariantId: variantId,
 });
 // Shopify returns the added line itself here; `items` is included because bulk-add themes read it.
 const payload: Record<string, unknown> = { ...line, items: [line] };

 // The theme's own <product-form> asks for `sections` alongside the add (Dawn's cart-notification
 // and cart-drawer both do) — see cart-sections.ts for why answering it matters as much as the add
 // itself: skip it and the theme's own JS throws reading `sections[id]` off nothing, and the
 // shopper never sees ANY confirmation, popup or otherwise, even though the item really was added.
 const requested = requestedSectionIds(body);
 if (requested.length) {
  const lines = await cartLines(token, store.sellerId).catch(() => []);
  payload.sections = await buildCartSectionsResponse({
   slug: store.slug,
   requested,
   sectionsUrl: typeof body.sections_url === "string" ? body.sections_url : null,
   addedLine: { title: line.title, image: line.image, priceCents: line.price, currency: item.currency },
   addedKey: String(line.key),
   itemCount,
   lines: lines.map((l) => ({
    id: l.id, title: l.title, priceCents: l.priceCents, currency: l.currency,
    image: l.image, href: `/products/${l.handle}`,
   })),
   checkoutHref: "/checkout?cart=1",
  }).catch(() => ({}));
 }

 const res = cartResponse(payload as never);
 return withCartCookie(res, token, isNew);
}
