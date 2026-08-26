import { NextRequest, NextResponse } from "next/server";
import { addToCart } from "@/app/lib/storefront-cart-db";
import { findItemByVariantId, isSellable } from "@/app/lib/plan-b/lookup";
import { resolveStore, cartToken, cartLines, readBody, withCartCookie, withSqsCartFlag } from "@/app/lib/plan-b/cart-session";
import { buildSqsCart, itemIdFromAddBody, toSqsEntry } from "@/app/lib/plan-b/sqs-cart-json";

export const dynamic = "force-dynamic";

/** Squarespace's own failure shape: its bundle renders `message` under the Add-to-cart button. */
function sqsError(message: string, status = 422): NextResponse {
 return NextResponse.json({ message }, { status, headers: { "Cache-Control": "no-store" } });
}

// POST /api/commerce/shopping-cart/entries — the seller's OWN "Add to cart" button (often renamed;
// on this store it reads "MAKE IT YOURS"), driving VYA's database.
//
// The page hands back the VYA item id because the serve path rewrote the product's identity into it
// (see plan-b/sqs-product.ts). Squarespace's bundle reads `shoppingCart` off the response to update
// its model — which is what flips the button to "Added!" and re-syncs the header cart pill — and
// `newlyAdded` for its own analytics event.
export async function POST(request: NextRequest) {
 const store = await resolveStore(request);
 if (!store) return sqsError("Unknown store.", 404);

 const body = await readBody(request);
 const itemId = itemIdFromAddBody(body);
 if (!itemId) return sqsError("No item was specified.", 400);

 const item = await findItemByVariantId(store.sellerId, itemId);
 if (!item) return sqsError("That item is no longer available.", 404);
 // One-of-one: a sold piece is gone, not backorderable.
 if (!isSellable(item)) return sqsError(`${item.title} has sold.`);

 const { token, isNew } = cartToken(request);
 await addToCart(token, item.id);

 const lines = await cartLines(token).catch(() => []);
 const cart = buildSqsCart(lines, token, Date.now());
 const newlyAdded = cart.entries.find((e) => e.itemId === item.id)
  // The cart read is best-effort; the piece was added either way, so answer with it rather than
  // letting the button sit on its spinner.
  ?? toSqsEntry({
   id: item.id, title: item.title, priceCents: item.priceCents, currency: item.currency,
   image: item.images?.[0] ?? null, handle: item.sourceId, sourceVariantId: item.sourceId,
  });

 const res = NextResponse.json({ shoppingCart: cart, newlyAdded }, { headers: { "Cache-Control": "no-store" } });
 return withSqsCartFlag(withCartCookie(res, token, isNew), true);
}
