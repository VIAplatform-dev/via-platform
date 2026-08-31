import { NextRequest, NextResponse } from "next/server";
import { removeFromCart } from "@/app/lib/storefront-cart-db";
import { resolveStore, cartToken, readBody, cartLines } from "@/app/lib/plan-b/cart-session";
import { cartSubmitAction } from "@/app/lib/plan-b/cart-submit";

export const dynamic = "force-dynamic";

// POST /cart — the theme's own cart FORM, which is how a shopper actually reaches checkout.
//
// Shopify's cart page and cart drawer are one form with two submit buttons (`update` and
// `checkout`) posting here. Unrouted, this POST fell through to Next, which took it for a Server
// Action and answered "Server action not found." — so Checkout did nothing on 16 of 18 captured
// Shopify stores, and on 7 of them the drawer carrying that button is in the header of every page.
//
// Answered with 303 See Other, deliberately: it turns the POST into a GET, so the shopper lands on
// a real page they can reload and go Back to, rather than a resubmit prompt.
export async function POST(request: NextRequest) {
 const store = await resolveStore(request);
 // 404, not 403 — a request that isn't on a store origin has no business learning this route exists.
 if (!store) return new NextResponse("Not found", { status: 404 });

 const { token } = cartToken(request);
 const action = cartSubmitAction(await readBody(request));

 /**
  * A RELATIVE Location, deliberately — not NextResponse.redirect(new URL(path, request.url)).
  *
  * request.url is resolved from the server's own view of the request, which behind a rewrite is not
  * reliably the seller's domain: locally it comes back as localhost:3333. Redirecting there would
  * walk the shopper off the store origin, and the cart cookie is scoped to that origin — so they
  * would land on checkout with an empty bag, one click from paying. A relative Location is resolved
  * by the browser against the page it is already on, so it cannot leave the origin.
  */
 const seeOther = (path: string) =>
  new NextResponse(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });

 if (action.kind === "checkout") {
  // An empty bag can't be paid for. The checkout page answers 409 for this, which would meet the
  // shopper as an error page; their own cart page explains it in their own theme.
  const lines = await cartLines(token, store.sellerId).catch(() => []);
  return seeOther(lines.length ? "/checkout?cart=1" : "/cart");
 }

 // An update. One-of-one stock means the only meaningful change is a removal, and the form
 // identifies lines by POSITION — so resolve each against the visitor's real bag rather than
 // trusting an index to mean anything on its own.
 if (action.removeLines.length) {
  const lines = await cartLines(token, store.sellerId).catch(() => []);
  for (const n of action.removeLines) {
   const line = lines[n - 1];
   if (line) await removeFromCart(token, line.id).catch(() => {});
  }
 }
 return seeOther("/cart");
}
