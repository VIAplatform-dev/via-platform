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
//
// A SECOND theme convention answers this same endpoint differently. Shopify's newer "Shapes"
// theme (and others built the same way) don't use the `<product-recommendations>` custom element
// at all — they fetch this URL via an Alpine.js `$fetchedFragment(url, selector)` helper, whose
// real implementation (read off the theme's own JS) is:
//
//   const html = await fetchHTML(url);
//   const fragment = querySelectorInHTMLString(selector, html);
//   return fragment ? fragment.innerHTML : "";
//
// — where `selector` is literally the string `.related-products`, written into the theme's own
// liquid template. Our wrapper only ever carried the `product-recommendations` TAG and an `id`;
// nothing on the page has that class, so the selector search comes back empty and the helper
// returns `""` — the "You may also like" block renders as nothing, on every page, every time,
// regardless of how good the recommendations themselves are. The wrapper below carries BOTH: the
// tag+id pair the first convention looks up, and the `.related-products` class the second one does.
//
// WHICH items to show, once the block actually renders. The theme sends the current product as a
// Shopify numeric id (`product_id=8005474746538`), which VYA items don't carry — they key on the
// source's HANDLE (`sourceId`) — so it can't be used to find the anchor product directly. What every
// browser DOES send on this fetch is a `Referer` of the product page itself, which has the handle
// right in it. Used to scope suggestions to the anchor's own category (denim shorts recommending
// other shorts, not a $5 charm) — a real gap once the block was rendering at all: a "You may also
// like" strip made of whatever's newest across the entire catalogue reads as broken in a different,
// less obvious way than not rendering. Falls back to the unscoped list when there's no referer, no
// matching item, or nothing else shares its category — never to an empty result (see above).
//
// ONE page can ask this endpoint TWICE, for two DIFFERENT blocks, and they must not answer the same
// way. "Shapes"-family product pages carry a compact widget INSIDE the info column (right by the
// accordions) that asks with `intent=complementary`, AND a full-width "Related Products" section
// further down the page that asks with no `intent` at all. Real Shopify only fills the first one in
// when a merchant has hand-picked complementary items for THIS product — most don't, so on the real
// site it's usually empty and invisible. VYA has no such hand-picked pairing data (only the
// category-based approximation above), so always answering it with real cards duplicated "You may
// also like" onto the SAME page twice — once correctly, full-width, below the listing, and once
// again squeezed into the narrow sidebar column it was never laid out for. `intent=complementary`
// is safe to leave genuinely empty: it's the Alpine `$fetchedFragment` consumer (see above), whose
// own code is `fragment ? fragment.innerHTML : ""` — no crash on empty, unlike the bare
// `<product-recommendations>` case this file exists to keep non-empty.
import { NextRequest } from "next/server";
import { storeSlugForHost } from "@/app/lib/plan-b/store-host";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listStorefrontItems } from "@/app/lib/db/inventory";
import { getCaptureOrigin } from "@/app/lib/site-capture-db";
import { pickRecommendationPool, recommendationCardsHtml, type RecommendationCard } from "@/app/lib/plan-b/recommendation-pool";
import {
 fetchRecommendationTemplate, isUsableRecommendationTemplate, loadRecommendationTemplate,
 renderRecommendationSection, saveRecommendationTemplate,
} from "@/app/lib/plan-b/recommendation-template";
import type { CollectionCardItem, HrefFor } from "@/app/lib/site-capture";

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

 // The compact sidebar widget — see file header for why this one specifically must answer empty
 // rather than duplicate the real, full-width section elsewhere on the same page.
 if (sp.get("intent") === "complementary") {
  return new Response(`<div class="related-products"></div>`, {
   headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
 }

 const seller = await getSellerBySlug(slug).catch(() => null);
 const items = seller ? await listStorefrontItems(seller.id).catch(() => []) : [];
 // The anchor product this recommendation strip belongs to, read off the Referer — see file header.
 const pool = pickRecommendationPool(items, req.headers.get("referer"));

 // Every photo, not just the first: the theme's own card may have a hover-swap slot for the second
 // one, and the renderer fills it when the piece has one to put there.
 const picks: CollectionCardItem[] = pool.slice(0, limit).map((it) => ({
  id: it.id, title: it.title, priceCents: it.priceCents, currency: it.currency,
  images: Array.isArray(it.images) ? it.images : [],
  sourceId: it.sourceId, available: it.status !== "sold",
 }));
 const cards: RecommendationCard[] = picks.map((it) => ({
  ...it, image: (Array.isArray(it.images) && typeof it.images[0] === "string") ? it.images[0] : null,
 }));

 // Typed on the fields it actually reads, so the same function serves both the generic cards and the
 // theme-templated ones without either shape having to know about the other.
 const hrefFor = (it: { id: string; sourceId?: string | null }) => (it.sourceId ? `/products/${it.sourceId}` : `/products/${it.id}`);

 // FIRST CHOICE: the seller's OWN strip, refilled with these pieces — the theme's section, heading,
 // card and button markup, so it looks like the rest of their shop rather than like us. Falls
 // through to the generic cards below whenever the store has no usable template (see
 // recommendation-template.ts); this must never be the difference between a strip and no strip.
 const themed = picks.length && sectionId
  ? await themedSection(slug, sectionId, sp.get("product_id"), limit, picks, hrefFor).catch(() => null)
  : null;
 if (themed) return htmlResponse(themed, elementId);

 // Must be genuinely non-empty — see the file header for why an empty response loops the tab.
 const inner = cards.length ? recommendationCardsHtml(cards, hrefFor) : `<p style="opacity:.6">Nothing else to show yet.</p>`;
 return htmlResponse(`<h3 style="margin:0 0 16px;text-align:center;font-size:1.4em">You may also like</h3>${inner}`, elementId);
}

/**
 * The strip in the seller's own markup, or null to fall back.
 *
 * The template is fetched from the source store the first time this store is ever asked for a strip
 * and kept from then on — see recommendation-template.ts. Both parameters that fetch needs
 * (`section_id`, `product_id`) are the ones the theme on the page just sent us, so the request we
 * make of the source is the one it was built to answer.
 */
async function themedSection(
 slug: string, sectionId: string, productId: string | null, limit: number,
 items: CollectionCardItem[], hrefFor: HrefFor,
): Promise<string | null> {
 let template = await loadRecommendationTemplate(slug).catch(() => null);
 if (!template) {
  const origin = await getCaptureOrigin(slug).catch(() => null);
  if (!origin) return null;
  const fetched = await fetchRecommendationTemplate(origin, sectionId, productId, Math.max(limit, 4));
  // Nothing to clone a card from is not worth keeping — a store answering empty today may well
  // answer with products tomorrow, and a saved dud would stop us ever asking again.
  if (!fetched || !isUsableRecommendationTemplate(fetched, items[0])) return null;
  await saveRecommendationTemplate(slug, fetched).catch(() => {});
  template = fetched;
 }
 return renderRecommendationSection(template, items, hrefFor, sectionId);
}

/**
 * The response, wrapped for whichever convention the theme reads it with.
 *
 * `<product-recommendations id="…">` is what Shopify's own product-recommendations.js looks up, and
 * `.related-products` is what the "Shapes"-family `$fetchedFragment(url, '.related-products')`
 * helper does — see the file header. Neither wrapper ever reaches the page (both consumers take its
 * innerHTML), so carrying both costs nothing and covers both. A themed fragment that already brings
 * its own `<product-recommendations>` is left alone rather than nested inside a second one.
 */
function htmlResponse(inner: string, elementId: string): Response {
 const body = /<product-recommendations/i.test(inner)
  ? inner
  : `<product-recommendations id="${elementId}" class="related-products">${inner}</product-recommendations>`;
 return new Response(body, {
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
 });
}
