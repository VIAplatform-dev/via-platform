// Rendering Shopify's "sections" response for the theme's OWN Add-to-cart JS.
//
// Dawn-family themes (and everything forked from Dawn — most of the corpus) don't just POST
// /cart/add and read the JSON back. Their <product-form> also asks for `sections`: a list of
// section ids to re-render, sent alongside the add (see product-form.js's onSubmitHandler). The
// real Shopify endpoint answers with full server-rendered HTML for each one; the theme's
// `cart-notification`/`cart-drawer` custom element then does
//
//   document.getElementById(section.id).innerHTML =
//     new DOMParser().parseFromString(response.sections[section.id], "text/html")
//       .querySelector(section.selector || ".shopify-section").innerHTML
//
// We have no Liquid renderer, so `response.sections` was simply missing — `sections[section.id]`
// on an undefined object throws inside that callback, and the WHOLE update (including the final
// `this.open()` that shows the popup) never runs. The item genuinely gets added; the shopper just
// never sees it happen. Confirmed against this theme's real, unminified... well, minified, but
// real, cart-notification.js and product-form.js — not guessed from memory.
//
// Pure — no database, no network. The route fetches whatever DOM fallback it needs and hands it in.

import { dawnBubbleHtml } from "./cart-badge.ts";

export type CartSectionLine = { title: string; image: string | null; priceCents: number; currency: string };

function esc(s: string): string {
 return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function formatMoney(cents: number, currency: string): string {
 try { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format((cents || 0) / 100); }
 catch { return `$${((cents || 0) / 100).toFixed(2)}`; }
}

/** Strip a previously-rendered count bubble back out of the cart icon's markup, so rebuilding it
 *  (see cart-icon-bubble below) never stacks a second one behind the fresh one. */
function withoutCountBubble(html: string): string {
 return html.replace(/<div class="cart-count-bubble">[\s\S]*?<\/div>/g, "");
}

/**
 * The 3 section ids Dawn's `cart-notification.js` always asks for (see getSectionsToRender() in
 * the theme file) — the only ones we can build FAITHFULLY, because we know exactly what markup and
 * CSS classes they need (`component-cart-notification.css`, already kept and loaded on Plan B).
 * Anything else the theme asks for (e.g. `cart-drawer`, if a store uses that cart type instead) is
 * the caller's job to fall back on — see buildFallbackSection().
 *
 * `cartIconHtml` is the header cart icon's OWN current innerHTML (its `<svg>`, from the captured
 * page) — `cart-icon-bubble`'s update REPLACES that element's entire innerHTML, so building the
 * count bubble alone throws the icon itself away: the header cart link is left with nothing to
 * click but an invisible "2".
 */
export function buildKnownCartSections(requestedIds: string[], line: CartSectionLine, key: string, itemCount: number, cartIconHtml = ""): Record<string, string> {
 const out: Record<string, string> = {};
 for (const id of requestedIds) {
  if (id === "cart-notification-product") {
   const img = line.image ? `<div class="cart-notification-product__image"><img src="${esc(line.image)}" alt="${esc(line.title)}" width="100" height="100" loading="lazy"></div>` : "";
   out[id] = `<div id="cart-notification-product-${esc(key)}">${img}<div><h3 class="cart-notification-product__name">${esc(line.title)}</h3><div class="price"><span class="price-item price-item--regular">${esc(formatMoney(line.priceCents, line.currency))}</span></div></div></div>`;
  } else if (id === "cart-notification-button") {
   out[id] = `<div class="shopify-section">View cart (${itemCount})</div>`;
  } else if (id === "cart-icon-bubble") {
   // Same builder the page-load badge uses (cart-badge.ts), so a re-render after Add-to-cart and a
   // fresh page load can never disagree about the markup — or about whether zero draws a bubble.
   const bubble = itemCount > 0 ? dawnBubbleHtml(itemCount) : "";
   out[id] = `<div class="shopify-section">${withoutCountBubble(cartIconHtml)}${bubble}</div>`;
  }
 }
 return out;
}

/**
 * For a section id we don't specifically know how to re-render (a different theme's cart type,
 * some customisation): echo back whatever that element ALREADY contains, unchanged, wrapped the
 * same way `getSectionInnerHTML`'s default `.shopify-section` selector expects.
 *
 * A no-op update isn't the real fix for that element, but it's a SAFE one — the alternative is
 * `sections[id]` being undefined, which throws and kills the notification for every section in the
 * request, including the two above that we DID get right.
 */
export function buildFallbackSection(existingInnerHtml: string): string {
 return `<div class="shopify-section">${existingInnerHtml}</div>`;
}
