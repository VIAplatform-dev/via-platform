// A captured SQUARESPACE product page, wired to the VYA piece it shows.
//
// Squarespace's product page is driven entirely by its own JavaScript: a `ProductDetail` controller
// reads the product out of a `data-context` JSON blob and its Add-to-cart button posts
// `{itemId, sku, quantity}` to /api/commerce/shopping-cart/entries (see sqs-cart-json.ts, which
// answers that call). The id it posts is whatever the capture froze — the SOURCE store's product id,
// which means nothing to VYA.
//
// So the identity is rewritten at serve time, exactly as Plan B does for a Shopify quick-add form:
// the page keeps every bit of the seller's own markup and behaviour, and the id it hands back to us
// is the VYA item's own. `findItemByVariantId` resolves a VYA uuid directly, so no mapping table and
// no import backfill is needed for the button to work.
import * as cheerio from "cheerio";
import type { Element as DomElement } from "domhandler";

export type SqsProductIdentity = {
 /** The source store's own product id, as captured. */
 productId: string;
 /** The product's name, from the same blob — the key we match a VYA item on when the import didn't
  *  record source ids. */
 title: string;
};

/** The Squarespace product page's own product, or null when this isn't one. */
export function sqsProductIdentity(html: string): SqsProductIdentity | null {
 // Cheap guard first: these are multi-megabyte documents, and parsing one costs ~180ms. Every page
 // of the site passes through here, so the parse below has to be reserved for the pages that are
 // actually product pages. `ProductDetail` is the controller Squarespace mounts on exactly those.
 if (!/data-controller=["']ProductDetail["']|class=["']product-detail["']/.test(html)) return null;
 const $ = cheerio.load(html);
 const $detail = $("[data-controller='ProductDetail'][data-product-id], .product-detail[data-product-id]").first();
 if (!$detail.length) return null;
 const productId = ($detail.attr("data-product-id") || "").trim();
 if (!productId) return null;
 let title = "";
 try {
  const ctx = JSON.parse($detail.attr("data-context") || "{}") as { product?: { title?: unknown } };
  if (typeof ctx.product?.title === "string") title = ctx.product.title;
 } catch { /* allow-swallow: the heading below is a perfectly good second source for the name */ }
 if (!title) title = ($("h1.product-title, h1").first().text() || "").replace(/\s+/g, " ").trim();
 return { productId, title };
}

/**
 * Point the page's Add-to-cart at a VYA item.
 *
 * Rewrites the id in all three places the capture repeats it — the `data-context` payload the
 * controller actually reads, the `data-product-id` attribute beside it, and the page region's
 * `data-item-id` — so nothing on the page still claims to be the source's product. Only values
 * EQUAL to the captured product id are touched, so a collection id or a website id that happens to
 * sit in the same attribute set is left alone.
 *
 * Also stamps `data-vya-add` on the button: on a VYA origin the seller's scripts are stripped and
 * the injected VYA cart drawer drives the same button instead (see injectCart).
 */
export function applySqsProductIdentity(html: string, vyaItemId: string, known?: SqsProductIdentity | null): string {
 // `known` is the identity the caller already read (it needed the title to find the VYA item) —
 // passing it back saves a second parse of a multi-megabyte page on every product view.
 const identity = known ?? sqsProductIdentity(html);
 if (!identity || !vyaItemId) return html;
 const $ = cheerio.load(html);
 const old = identity.productId;

 for (const attr of ["data-product-id", "data-item-id"]) {
  $(`[${attr}='${old}']`).attr(attr, vyaItemId);
 }
 $("[data-context]").each((_: number, el: DomElement) => {
  const raw = $(el).attr("data-context") || "";
  if (!raw.includes(old)) return;
  try {
   const ctx = JSON.parse(raw) as { product?: { id?: unknown } };
   if (typeof ctx.product?.id !== "string" || ctx.product.id !== old) return;
   ctx.product.id = vyaItemId;
   $(el).attr("data-context", JSON.stringify(ctx));
  } catch { /* allow-swallow: an unparseable context is the theme's own, and not ours to rewrite */ }
 });

 // Squarespace repeats the same id in its page-context bootstrap (`Static.SQUARESPACE_CONTEXT.item`),
 // which its quick view and its analytics read. A literal swap of that exact id is bounded and safe;
 // parsing arbitrary inline JS is not. The `<body id="item-…">` hook is deliberately left alone —
 // a seller's page-specific custom CSS is written against it.
 $("script:not([src])").each((_: number, el: DomElement) => {
  const code = $(el).html() || "";
  if (!code.includes(old)) return;
  $(el).text(code.split(old).join(vyaItemId));
 });

 $(".sqs-add-to-cart-button").attr("data-vya-add", vyaItemId);
 return $.html();
}
