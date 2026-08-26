// Shopify's `/recommendations/products` endpoint, answered from live VYA inventory.
//
// Every Shopify theme's product page fetches this to fill a "You may also like" strip, and expects
// back a rendered HTML section. Unrouted it 404'd, which the theme reported as
// `Product recommendations error: Server returned 404` and left the section as a permanent empty
// hole in the page — the original reason this route exists.
//
// THIS USED TO ANSWER EMPTY (a bare `.shopify-section` div with nothing in it), on the theory that
// the theme would find no `<product-recommendations>` element in that response, treat it as "no
// recommendations", and hide the block — the same thing Shopify does for a product with none. That
// theory was wrong, and the real behaviour is much worse than a blank strip.
//
// `product-recommendations.js`'s element watches its OWN attributes with a MutationObserver, and
// re-triggers a fetch on ANY attribute change except `data-recommendations-performed` flipping to
// "true" (see #mutationObserver's callback). Its own error handler does:
//
//   this.classList.add("hidden");
//   this.dataset.error = "Error loading product recommendations";
//
// — two attribute writes, on the very element the observer is watching, and `dataset.error` never
// stops changing (a `setAttribute` call still fires a mutation record even when the value is
// byte-identical to what was already there — the DOM spec has no early-return for that). Every
// error handled schedules ANOTHER attribute write, which schedules ANOTHER error handled: an
// infinite, self-sustaining loop of fetches this endpoint was feeding on every single page load,
// pegging the tab's event loop until Chrome killed the renderer. `result.success` only checks
// `response.ok` — our 200-with-nothing-useful response counted as "success" and STILL fell through
// to the error handler, because the theme then looks for a `<product-recommendations id="...">`
// wrapper with non-empty content inside the body and calls it an error when that's missing too.
//
// The fix isn't a differently-empty response — there is no empty shape this theme's own code
// won't loop on. It has to be genuinely non-empty: a real `<product-recommendations id="...">`
// with real cards inside, which is what this route now builds from the seller's OTHER live listings.
import { NextRequest } from "next/server";
import { storeSlugForHost } from "@/app/lib/plan-b/store-host";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listStorefrontItems } from "@/app/lib/db/inventory";
import { liveGridHtml, type CollectionCardItem } from "@/app/lib/site-capture";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
 const slug = storeSlugForHost(req.headers.get("host"));
 if (!slug) return new Response("Not found", { status: 404 });

 const sp = req.nextUrl.searchParams;
 const sectionId = (sp.get("section_id") || "").replace(/[^a-zA-Z0-9_-]/g, "");
 // Shopify's own id convention for this element — see product-recommendations.js's
 // `product-recommendations[id="${id}"]` lookup, checked against this exact page's rendered
 // `id="product-recommendations-{section_id}"` attribute.
 const elementId = `product-recommendations-${sectionId}`;
 const limit = Math.max(1, Math.min(12, Number(sp.get("limit")) || 4));
 // The current product's numeric Shopify id — we don't store that (VYA items key on the handle,
 // not Shopify's internal id), so it can't be used to exclude the current item here. Showing it
 // among its own recommendations sometimes is a minor cosmetic miss, not a functional one.

 const seller = await getSellerBySlug(slug).catch(() => null);
 const items = seller ? await listStorefrontItems(seller.id).catch(() => []) : [];
 const cards: CollectionCardItem[] = items.slice(0, limit).map((it) => ({
  id: it.id, title: it.title, priceCents: it.priceCents, currency: it.currency, images: it.images,
  sourceId: it.sourceId, available: it.status !== "sold",
 }));

 const hrefFor = (it: CollectionCardItem) => (it.sourceId ? `/products/${it.sourceId}` : `/products/${it.id}`);
 // Must be genuinely non-empty — see the file header for why an empty response loops the tab.
 const inner = cards.length ? liveGridHtml(cards, hrefFor) : `<p style="opacity:.6">Nothing else to show yet.</p>`;
 const body = `<product-recommendations id="${elementId}"><h3 style="margin:0 0 16px">You may also like</h3>${inner}</product-recommendations>`;

 return new Response(body, {
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
 });
}
