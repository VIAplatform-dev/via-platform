import { unavailableLabel } from "../unavailable-label.ts";
// Which items belong in a product's "You may also like" strip — see the recommendations route for
// why this exists and why it reads the anchor product off a Referer header rather than the
// Shopify numeric id the theme actually sends.
//
// Pure — no database, no network. The route resolves the seller's items and the referer; this picks
// which of them to show.

export type RecommendationItem = { id: string; sourceId?: string | null; category?: string | null };

/** The `/products/{handle}` segment of a Referer URL, or null if there isn't one / it doesn't parse. */
export function refererProductHandle(referer: string | null | undefined): string | null {
 if (!referer) return null;
 try { return new URL(referer).pathname.match(/\/products\/([^/?#]+)/)?.[1] || null; }
 catch { return null; }
}

/**
 * The recommendation pool for a product page, scoped to the anchor's own category when possible.
 *
 * Falls back to "everything except the anchor" — never to empty — when there's no referer, no
 * matching item, or nothing else shares its category. An empty response is what turns this section
 * into an infinite fetch-retry loop on some themes (see the route); a mis-scoped-but-real one is
 * merely a worse recommendation, never a crash.
 */
export function pickRecommendationPool<T extends RecommendationItem>(items: T[], referer: string | null | undefined): T[] {
 const handle = refererProductHandle(referer);
 const anchor = handle ? items.find((i) => i.sourceId === handle) : null;
 if (!anchor) return items;
 const sameCategory = anchor.category ? items.filter((i) => i.id !== anchor.id && i.category === anchor.category) : [];
 return sameCategory.length ? sameCategory : items.filter((i) => i.id !== anchor.id);
}

function esc(s: string): string {
 return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function money(cents: number | null, currency: string | null): string {
 if (cents == null) return "";
 try { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(cents / 100); }
 catch { return `$${Math.round((cents || 0) / 100)}`; }
}

export type RecommendationCard = {
 id: string; title: string; priceCents: number | null; currency: string | null; image: string | null;
 sourceId?: string | null; available?: boolean;
 /** Why it cannot be bought — decides the wording. See app/lib/unavailable-label.ts. */
 unavailableReason?: string | null;
};

/**
 * The recommendation grid, WITH a real, working "Add to cart" button per card — a form posting to
 * Shopify's own bridge route (see plan-b/cart/add) with the id `findItemByVariantId` already knows
 * how to resolve (the source handle, falling back to the VYA item id).
 *
 * The form is marked `data-vya-rec-add` rather than left to submit natively: a plain native submit
 * navigates the WHOLE PAGE to the bridge's raw JSON response — the item really gets added, but the
 * shopper is dropped on a blank page of `{"id":...}` text instead of staying put. What honours that
 * marker is recommendationAddScript(), which is injected into the PAGE and not into this fragment;
 * see its own comment for why a script shipped inside the fragment could never have worked.
 *
 * This is Shopify's own bridge route, so it's only correct on a Plan B store origin — which is the
 * only place this endpoint is ever reached from (it's resolved by store host). A generic reusable
 * grid renderer that also serves Plan A's fallback grids can't hardcode this action: Plan A has no
 * `/cart/add` bridge at its origin, only VYA's own `/api/storefront/cart`. Kept separate from that
 * shared renderer rather than risk it there.
 */
export function recommendationCardsHtml(items: RecommendationCard[], hrefFor: (it: RecommendationCard) => string): string {
 const cards = items.map((it) => {
  const media = it.image
   ? `<img src="${esc(it.image)}" alt="${esc(it.title || "")}" loading="lazy" style="display:block;width:100%;aspect-ratio:3/4;object-fit:cover;background:#f2f0eb">`
   : `<div style="aspect-ratio:3/4;background:#f2f0eb">&nbsp;</div>`;
  const variantId = esc(it.sourceId || it.id);
  const cart = it.available === false
   ? `<button type="button" disabled style="margin-top:9px;width:100%;padding:9px;border:1px solid currentColor;opacity:.4;background:none;font:inherit;cursor:not-allowed">${esc(unavailableLabel(it.unavailableReason))}</button>`
   : `<form method="post" action="/cart/add" data-vya-rec-add style="margin-top:9px"><input type="hidden" name="id" value="${variantId}"><button type="submit" style="width:100%;padding:9px;border:1px solid currentColor;background:none;color:inherit;font:inherit;cursor:pointer">Add to cart</button></form>`;
  return `<div style="font-family:inherit;color:inherit">` +
   `<a href="${esc(hrefFor(it))}" style="text-decoration:none;color:inherit">${media}` +
   `<div style="font-size:14px;margin-top:9px;line-height:1.3">${esc(it.title || "")}</div>` +
   `<div style="font-size:14px;opacity:.7;margin:2px 0">${money(it.priceCents, it.currency)}</div>` +
   `</a>${cart}</div>`;
 }).join("");
 return `<div data-vya-collection="1" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:26px;padding:26px 0;font-family:inherit;color:inherit">${cards}</div>`;
}

/**
 * The submit interceptor every card in the strip shares, whoever rendered the card.
 *
 * IT LIVES ON THE PAGE, NOT IN THE FRAGMENT, and that is the whole point. Both theme conventions
 * take our response and assign it with `innerHTML` (`$fetchedFragment` returns the matched element's
 * innerHTML; product-recommendations.js assigns its own) — and **a <script> inserted by innerHTML
 * never executes**, per the HTML spec. Shipped inside the strip, as it was, this handler was dead
 * markup: every "Add to cart" in the recommendations fell through to a native submit and navigated
 * the shopper to the bridge's raw JSON. Injected into the served product page (see the product
 * route) it is real, ordinary page script, and being delegated from `document` it catches forms
 * that arrive long afterwards — which is exactly what a lazily-fetched strip is.
 *
 * Shared with the theme-templated strip (see recommendation-template.ts), whose cards are the
 * SELLER'S own quick-buy forms: same `/cart/add` action, same need not to navigate away.
 *
 * Written against the theme's own markup as well as ours: the button's label lives in a child span
 * on the seller's push-button, so the text is written to the deepest element holding it rather than
 * to the button, which would otherwise flatten the button's own inner markup into a bare word.
 */
export function recommendationAddScript(): string {
 return `<script>if(!window.__vyaRecAddInit){window.__vyaRecAddInit=1;document.addEventListener("submit",function(e){` +
  `var f=e.target.closest&&e.target.closest("[data-vya-rec-add]");if(!f)return;e.preventDefault();` +
  `var btn=f.querySelector("button[type=submit]"),idEl=f.querySelector("[name=id]");if(!idEl)return;var id=idEl.value;` +
  `var label=btn&&(btn.querySelector("span:not(.visually-hidden):not(.sr-only)")||btn),old=label&&label.textContent;` +
  `if(btn){btn.disabled=true}if(label){label.textContent="Adding…"}` +
  `fetch("/cart/add.js",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:id,quantity:1})})` +
  `.then(function(r){return r.json()}).then(function(){if(label)label.textContent="Added ✓"})` +
  `.catch(function(){if(btn){btn.disabled=false}if(label){label.textContent=old}})` +
  `})}</script>`;
}

/**
 * Put the interceptor on a served page, once.
 *
 * Appended to <body> so it runs after the document is parsed, and idempotent twice over: the guard
 * here keeps a page that already carries it from carrying it twice, and the `window.__vyaRecAddInit`
 * flag inside the script itself keeps the listener from being attached twice if it ever does.
 */
export function injectRecommendationAddHandler(html: string): string {
 if (html.includes("__vyaRecAddInit")) return html;
 const script = recommendationAddScript();
 return html.includes("</body>") ? html.replace("</body>", `${script}</body>`) : html + script;
}
