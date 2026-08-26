import { NextRequest } from "next/server";
import { removeFromCart } from "@/app/lib/storefront-cart-db";
import { resolveStore, cartToken, currentCart, cartResponse, errorResponse, readBody, withCartCookie } from "@/app/lib/plan-b/cart-session";

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
 const line = String(body.id ?? body.line ?? body.key ?? "").trim();
 const quantity = Number(body.quantity ?? 1);

 const { token, isNew } = cartToken(request);
 // `key` is the VYA item id (see toCartLine), so a remove needs no lookup table.
 if (line && Number.isFinite(quantity) && quantity <= 0) await removeFromCart(token, line);

 return withCartCookie(cartResponse(await currentCart(token)), token, isNew);
}
