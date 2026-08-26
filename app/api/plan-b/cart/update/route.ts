import { NextRequest } from "next/server";
import { removeFromCart } from "@/app/lib/storefront-cart-db";
import { resolveStore, cartToken, currentCart, cartResponse, errorResponse, readBody, withCartCookie } from "@/app/lib/plan-b/cart-session";

export const dynamic = "force-dynamic";

// POST /cart/update.js — the theme's bulk update (`updates: { "<line key>": 0, … }`), plus cart
// note/attributes. Same one-of-one rule as /cart/change: 0 removes, anything else is a no-op that
// answers with the true cart.
export async function POST(request: NextRequest) {
 const store = await resolveStore(request);
 if (!store) return errorResponse("Unknown store.", 404);

 const body = await readBody(request);
 const { token, isNew } = cartToken(request);

 const updates = body.updates;
 if (updates && typeof updates === "object" && !Array.isArray(updates)) {
  for (const [key, raw] of Object.entries(updates as Record<string, unknown>)) {
   if (Number(raw) <= 0) await removeFromCart(token, key);
  }
 }
 return withCartCookie(cartResponse(await currentCart(token)), token, isNew);
}
