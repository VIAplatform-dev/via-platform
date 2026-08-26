import { NextRequest } from "next/server";
import * as cheerio from "cheerio";
import { addToCart, getCartItemIds } from "@/app/lib/storefront-cart-db";
import { findItemByVariantId, isSellable } from "@/app/lib/plan-b/lookup";
import { variantIdFromAddBody, toCartLine } from "@/app/lib/plan-b/cart-json";
import { buildKnownCartSections, buildFallbackSection } from "@/app/lib/plan-b/cart-sections";
import { resolveStore, cartToken, cartResponse, errorResponse, readBody, withCartCookie } from "@/app/lib/plan-b/cart-session";
import { getCapturePage } from "@/app/lib/site-capture-db";

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
 await addToCart(token, item.id);
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
 const requestedSections = typeof body.sections === "string" ? body.sections.split(",").map((s) => s.trim()).filter(Boolean) : [];
 if (requestedSections.length) {
  const sectionLine = { title: line.title, image: line.image, priceCents: line.price, currency: item.currency };
  // `cart-icon-bubble`'s update REPLACES the header cart link's entire innerHTML, so rebuilding it
  // needs the icon's OWN current markup (its <svg>) to rebuild AROUND, not just the count bubble —
  // otherwise the icon itself vanishes the moment a count bubble is due to appear. The calling page
  // is what the theme sends us as `sections_url`; also reused below as the fallback source for any
  // section id we don't specifically know how to re-render.
  const sectionsUrl = typeof body.sections_url === "string" ? body.sections_url : null;
  const pageHtml = sectionsUrl ? await getCapturePage(store.slug, sectionsUrl).catch(() => null) : null;
  const $ = pageHtml ? cheerio.load(pageHtml) : null;
  const cartIconHtml = $ ? $("#cart-icon-bubble").first().html() || "" : "";

  const sections = buildKnownCartSections(requestedSections, sectionLine, String(line.key), itemCount, cartIconHtml);
  const unknown = requestedSections.filter((id) => !(id in sections));
  // Best-effort fallback for a section id we don't specifically know how to re-render (a different
  // cart type, some theme customisation): echo back what's already there rather than leaving it
  // undefined, which would throw and kill the WHOLE notification — see buildFallbackSection().
  if (unknown.length && $) {
   for (const id of unknown) {
    const $el = $(`#${id}`).first();
    if ($el.length) sections[id] = buildFallbackSection($el.html() || "");
   }
  }
  payload.sections = sections;
 }

 const res = cartResponse(payload as never);
 return withCartCookie(res, token, isNew);
}
