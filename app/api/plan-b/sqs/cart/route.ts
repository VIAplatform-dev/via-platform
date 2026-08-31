import { NextRequest, NextResponse } from "next/server";
import { resolveStore, cartToken, cartLines, withSqsCartFlag } from "@/app/lib/plan-b/cart-session";
import { buildSqsCart, NO_CART_MESSAGE } from "@/app/lib/plan-b/sqs-cart-json";

export const dynamic = "force-dynamic";

// GET /api/commerce/shopping-cart — Squarespace's own bundle asks for the cart on every page load,
// then syncs the header pill from what comes back. Middleware rewrites a store origin's request
// here (see squarespaceThemeRoute).
export async function GET(request: NextRequest) {
 const store = await resolveStore(request);
 if (!store) return NextResponse.json({ message: NO_CART_MESSAGE }, { status: 404 });

 const { token } = cartToken(request);
 const lines = await cartLines(token, store.sellerId).catch(() => []);
 // Squarespace answers a visitor with no cart with a 404 and this message, and its bundle treats
 // that as "empty" rather than as an error. Answering 200-with-an-empty-cart instead makes the
 // pill render a cart the shopper never started.
 // The `hasCart` flag is kept in step with the answer either way: left set on an empty cart, the
 // theme keeps fetching a cart that isn't there and offers a Checkout button for it.
 if (!lines.length) return withSqsCartFlag(NextResponse.json({ message: NO_CART_MESSAGE }, { status: 404, headers: { "Cache-Control": "no-store" } }), false);

 return withSqsCartFlag(NextResponse.json(buildSqsCart(lines, token, Date.now()), { headers: { "Cache-Control": "no-store" } }), true);
}
