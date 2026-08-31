// The `sections` half of every cart response, in one place.
//
// Dawn-family themes don't just POST a cart change — they also ask the server to re-render named
// sections and swap the HTML into the page. If `sections` is missing from the response, the theme's
// own callback throws reading `sections[id]` off nothing, and the shopper is shown
// "There was an error while updating your cart" even though the change was applied.
//
// /cart/add.js answered this and /cart/change.js did not, which is why Add to cart worked and Remove
// showed a red error. One builder now serves both, so they cannot drift again.
import * as cheerio from "cheerio";
import { getCapturePage } from "../site-capture-db.ts";
import { buildKnownCartSections, buildFallbackSection, type CartSectionLine } from "./cart-sections.ts";
import { buildCartDrawerSection } from "./cart-drawer.ts";
import { loadCartTemplate } from "./cart-template-store.ts";
import { capturePathFor } from "./capture-path.ts";
import type { CartPageLine } from "../site-capture.ts";

export async function buildCartSectionsResponse(opts: {
 slug: string;
 requested: string[];
 sectionsUrl: string | null;
 /** The line the theme is showing a confirmation for (an add); null for a change. */
 addedLine: CartSectionLine | null;
 addedKey: string;
 itemCount: number;
 /** The visitor's whole bag, for the drawer. */
 lines: CartPageLine[];
 checkoutHref: string;
}): Promise<Record<string, string>> {
 const { slug, requested, sectionsUrl, addedLine, addedKey, itemCount, lines, checkoutHref } = opts;
 if (!requested.length) return {};

 // The calling page. capturePathFor strips the query, because a product page with a variant
 // selected sends "/products/x?variant=123" and captures are stored under a bare path.
 const path = sectionsUrl ? capturePathFor(sectionsUrl) : null;
 let pageHtml = path ? await getCapturePage(slug, path).catch(() => null) : null;
 if (!pageHtml && path) {
  const alt = path.endsWith("/") ? path.replace(/\/+$/, "") : `${path}/`;
  pageHtml = await getCapturePage(slug, alt).catch(() => null);
 }
 // The drawer and cart icon live in the site header, which is on every page — so when the calling
 // page was never captured (product pages are rendered on demand), the home page serves as well.
 if (!pageHtml) pageHtml = await getCapturePage(slug, "/").catch(() => null);

 const $ = pageHtml ? cheerio.load(pageHtml) : null;
 const cartIconHtml = $ ? $("#cart-icon-bubble").first().html() || "" : "";

 // The cart-notification family, which we can build faithfully.
 const sections = addedLine
  ? buildKnownCartSections(requested, addedLine, addedKey, itemCount, cartIconHtml)
  : buildKnownCartSections(requested.filter((id) => id === "cart-icon-bubble"), { title: "", image: null, priceCents: 0, currency: "USD" }, "", itemCount, cartIconHtml);

 // The drawer, from the layout derived at import time where the store has one.
 if (requested.includes("cart-drawer") && pageHtml) {
  const template = await loadCartTemplate(slug).catch(() => null);
  const rowTemplateHtml = (await getCapturePage(slug, "/cart").catch(() => null)) || undefined;
  const drawer = buildCartDrawerSection({ pageHtml, rowTemplateHtml, template, lines, checkoutHref });
  if (drawer) sections["cart-drawer"] = drawer;
 }

 // Anything else the theme asked for: echo what is already on the page rather than leaving it
 // undefined, which throws inside the theme's callback and kills the whole update.
 if ($) {
  for (const id of requested.filter((x) => !(x in sections))) {
   const $el = $(`#${id}`).first();
   if ($el.length) sections[id] = buildFallbackSection($el.html() || "");
  }
 }
 return sections;
}

/** The section ids a theme asked for, however it spelled the request. */
export function requestedSectionIds(body: Record<string, unknown>): string[] {
 const raw = body.sections;
 if (typeof raw === "string") return raw.split(",").map((s) => s.trim()).filter(Boolean);
 if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
 return [];
}
