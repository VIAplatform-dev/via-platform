import { NextRequest } from "next/server";
import { resolveStore, cartToken, currentCart, cartResponse, errorResponse } from "@/app/lib/plan-b/cart-session";

export const dynamic = "force-dynamic";

// GET /cart.js — the theme asks for the current cart on page load and after every mutation.
// Middleware rewrites the store origin's /cart.js (and /cart.json) here.
export async function GET(request: NextRequest) {
 const store = await resolveStore(request);
 if (!store) return errorResponse("Unknown store.", 404);
 const { token } = cartToken(request);
 return cartResponse(await currentCart(token));
}
