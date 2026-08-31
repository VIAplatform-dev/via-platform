import { NextRequest } from "next/server";
import { removeFromCart } from "@/app/lib/storefront-cart-db";
import { resolveStore, cartToken, currentCart, cartLines, cartResponse, errorResponse, readBody, withCartCookie } from "@/app/lib/plan-b/cart-session";
import { buildCartSectionsResponse, requestedSectionIds } from "@/app/lib/plan-b/cart-sections-response";

export const dynamic = "force-dynamic";

// POST /cart/change.js — the theme's quantity stepper and line "remove" control.
//
// VYA inventory is one-of-one, so the only meaningful change is quantity 0 = remove. Any other
// quantity is answered with the unchanged cart rather than an error: a theme that optimistically
// sends quantity 2 should show the shopper the truth (still one), not a red banner.
export async function POST(request: NextRequest) {
 const store = await resolveStore(request);
 if (!store) return errorResponse("Unknown store.", 404);

 const body = await readBody(request);
 const raw = String(body.id ?? body.line ?? body.key ?? "").trim();
 const quantity = Number(body.quantity ?? 1);
 const { token, isNew } = cartToken(request);

 if (raw && Number.isFinite(quantity) && quantity <= 0) {
  // Themes address a line two different ways, and both arrive here. The DRAWER sends the line key,
  // which is the VYA item id (see toCartLine). The CART PAGE sends `line` as a 1-based POSITION.
  // Treating a position as an id removed nothing at all — the row stayed, the shopper pressed the
  // bin again, and nothing ever happened.
  if (/^\d+$/.test(raw)) {
   const lines = await cartLines(token, store.sellerId).catch(() => []);
   const target = lines[Number(raw) - 1];
   if (target) await removeFromCart(token, target.id);
  } else {
   await removeFromCart(token, raw);
  }
 }

 const cart = await currentCart(token, store.sellerId);
 const lines = await cartLines(token, store.sellerId).catch(() => []);

 // The theme asks for re-rendered sections here exactly as it does on add. Omitting them is what
 // produced "There was an error while updating your cart" on a change that had actually succeeded.
 const requested = requestedSectionIds(body);
 const payload: Record<string, unknown> = { ...cart };
 if (requested.length) {
  payload.sections = await buildCartSectionsResponse({
   slug: store.slug,
   requested,
   sectionsUrl: typeof body.sections_url === "string" ? body.sections_url : null,
   addedLine: null,
   addedKey: "",
   itemCount: lines.length,
   lines: lines.map((l) => ({
    id: l.id, title: l.title, priceCents: l.priceCents, currency: l.currency,
    image: l.image, href: `/products/${l.handle}`,
   })),
   checkoutHref: "/checkout?cart=1",
  }).catch(() => ({}));
 }

 return withCartCookie(cartResponse(payload as never), token, isNew);
}
