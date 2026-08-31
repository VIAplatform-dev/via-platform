// The header cart count, made to mean one thing everywhere.
//
// THE BUG THIS EXISTS TO KILL. A captured page freezes whatever the crawler's own Shopify session
// happened to contain at capture time. Crawl `/cart` while that session holds a piece and the theme
// renders `<div class="cart-count-bubble">1</div>` straight into the stored HTML — so the hosted
// store shows "1" on the cart page and nothing anywhere else, for every shopper, forever, no matter
// what is actually in their VYA bag. Confirmed on maison-optimism-vintage; the same trap applies to
// every store we crawl.
//
// So the rule is: the captured badge is never trusted. Every served page has its own badge stripped
// and re-rendered from the visitor's REAL cart, using the same count the theme's own /cart.js call
// reports (see cart-session.currentCart — sold and removed pieces drop out of both).
//
// Themes disagree about the markup, so this covers the three shapes in the corpus and falls back to
// a VYA-drawn badge for the rest:
//   • Dawn family     — <a id="cart-icon-bubble"> … <div class="cart-count-bubble">
//   • Horizon family  — <cart-icon> … <div class="cart-bubble visually-hidden">
//   • Alpine themes   — <span x-text="$store.cart_count.count">0</span>
//   • anything else   — our own badge, appended to the header's cart control
//
// Pure — no database, no network. Callers pass the count in.
import * as cheerio from "cheerio";
import type { Element as DomElement } from "domhandler";

/** Controls that open or link to a cart. Deliberately broad: a theme we've never seen still gets a
 *  correct badge from the generic branch, which is the whole point of "universally consistent". */
const CART_CONTROL_SELECTORS = [
 "#cart-icon-bubble",
 "cart-icon",
 'a[href="/cart"]',
 'a[href^="/cart?"]',
 'a[aria-label*="cart" i]',
 'button[aria-label*="cart" i]',
 'a[aria-controls*="cart" i]',
 'button[aria-controls*="cart" i]',
 'a[data-drawer-id*="cart" i]',
 'button[data-drawer-id*="cart" i]',
].join(",");

/** How Alpine-based themes bind their cart count. */
const ALPINE_COUNT = '[x-text*="cart_count"], [x-text*="cart.count"]';

/** Where a HEADER cart control lives. */
const HEADER_ANCESTORS = 'header,[class*="header" i],[id*="header" i],nav,[role="banner"]';

/**
 * Controls that match the selectors above but must never be badged. Both cases are real, found by
 * running this against all 16 captured storefronts rather than reasoned about:
 *
 *  • We Thieves' cart drawer sits INSIDE the site header, so its `aria-label="Close cart"` button
 *    passed the header test and got a count stuck to the X that closes the drawer.
 *  • Dawn's "Item added to your cart" popup contains `<a href="/cart" id="cart-notification-button">
 *    View cart</a>` — also in the header — so every Dawn store drew a second badge on a popup
 *    button as well as the correct one on the header icon.
 *
 * Close buttons are identified on the element ITSELF (label, class, data-action), never by an
 * ancestor: Horizon wraps its legitimate header cart button in `<cart-drawer-component
 * class="cart-drawer">`, so excluding anything under a "drawer" would throw away the real control.
 */
const DISMISS_ANCESTORS = 'dialog,[role="dialog"],[aria-modal="true"],cart-notification,[class*="notification" i]';
function isDismissControl($el: cheerio.Cheerio<DomElement>): boolean {
 const label = `${$el.attr("aria-label") || ""} ${$el.attr("class") || ""} ${$el.attr("data-action") || ""}`;
 if (/\bclose\b/i.test(label)) return true;
 return $el.parents(DISMISS_ANCESTORS).length > 0;
}

/** Dawn's count bubble, verbatim from the theme. Shared with the Section Rendering API answer
 *  (cart-sections.ts) so a page load and a post-add re-render can never disagree about the markup. */
export function dawnBubbleHtml(count: number): string {
 return `<div class="cart-count-bubble"><span aria-hidden="true">${count}</span><span class="visually-hidden">${count} item${count === 1 ? "" : "s"}</span></div>`;
}

/** VYA's own badge, for a theme with no count element of its own. Inline-styled because the theme's
 *  stylesheet knows nothing about it, and ringed in white so it stays legible on a dark header. */
function vyaBadgeHtml(count: number): string {
 return `<span data-vya-cart-badge="1" style="position:absolute;top:-4px;right:-8px;min-width:17px;height:17px;padding:0 4px;box-sizing:border-box;border-radius:999px;background:#111;color:#fff;font:600 10px/17px -apple-system,BlinkMacSystemFont,system-ui,sans-serif;text-align:center;letter-spacing:0;box-shadow:0 0 0 1.5px rgba(255,255,255,.92);pointer-events:none;z-index:2"><span aria-hidden="true">${count}</span><span class="visually-hidden" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap">${count} item${count === 1 ? "" : "s"} in cart</span></span>`;
}

/** Add `position:relative` to an inline style, but never overwrite a position the theme set itself —
 *  an absolutely-placed control that we re-anchor jumps somewhere else on the page. */
function withRelativePosition(style: string | undefined): string {
 const s = (style || "").trim();
 if (/(^|;)\s*position\s*:/i.test(s)) return s;
 return s ? `${s.replace(/;\s*$/, "")};position:relative` : "position:relative";
}

/** Every phrasing of the count that themes bake into labels and screen-reader text. */
function restateCountText(text: string, count: number): string {
 return text
  .replace(/(total items in (?:your )?cart:?\s*)\d+/gi, (_m, p1) => `${p1}${count}`)
  .replace(/\b\d+\s+items?\s+in\s+(?:your\s+)?cart\b/gi, `${count} item${count === 1 ? "" : "s"} in cart`);
}

/**
 * Re-render the cart badge on a captured page from the visitor's real cart.
 *
 * Idempotent: a page that already carries a VYA badge (or a stale captured one) is stripped clean
 * first, so serving the same HTML twice can never stack two numbers.
 */
export function applyCartBadge(html: string, count: number): string {
 if (!html) return html;
 const n = Math.max(0, Math.floor(count) || 0);
 // Cheap bail-out: no cart control in the markup at all (a few captures are header-less fragments),
 // so there is nothing to badge and no reason to pay for a parse.
 if (!/cart/i.test(html)) return html;

 const $ = cheerio.load(html);

 // 1. Throw away every badge the capture froze in, ours and the theme's alike. Re-added below only
 //    where it belongs — this is what stops the `/cart` page keeping its phantom "1".
 $(".cart-count-bubble").remove();
 $("[data-vya-cart-badge]").remove();

 // 2. The header's cart control(s). A control nested inside another match (Horizon's <cart-icon>
 //    inside its <button aria-label="Open cart">) would otherwise be badged twice.
 const found = new Set<DomElement>($(CART_CONTROL_SELECTORS).toArray() as DomElement[]);
 // Alpine themes (hachi archive) label their cart button with nothing at all — no href, no aria-label,
 // just an @click handler. The count element they bind is the only thing that identifies it.
 for (const el of $(ALPINE_COUNT).toArray() as DomElement[]) {
  const owner = $(el).closest("a, button").get(0) as DomElement | undefined;
  if (owner) found.add(owner);
 }
 const controls = [...found].filter((el) => {
  const $el = $(el);
  if ($el.parents(CART_CONTROL_SELECTORS).length > 0) return false;
  if (isDismissControl($el)) return false;
  // `#cart-icon-bubble` and `<cart-icon>` are unambiguous by name; everything else has to prove it
  // lives in the site header rather than inside the drawer it opens.
  if ($el.is("#cart-icon-bubble, cart-icon")) return true;
  return $el.parents(HEADER_ANCESTORS).length > 0;
 });

 for (const el of controls) {
  const $c = $(el);

  // Dawn's own icon swaps between an empty and a full bag. Left alone, a captured `/cart` page kept
  // showing the full one to a shopper with nothing in their bag.
  $c.find("svg.icon-cart, svg.icon-cart-empty").each((_: number, s: DomElement) => {
   const $s = $(s);
   $s.removeClass("icon-cart icon-cart-empty").addClass(n > 0 ? "icon-cart" : "icon-cart-empty");
  });

  // Horizon: the bubble already exists in the markup, hidden. Show it, or hide it again.
  const $horizon = $c.find(".cart-bubble").first();
  if ($horizon.length) {
   $horizon.removeClass("visually-hidden");
   if (n === 0) $horizon.addClass("visually-hidden");
   const $countEl = $horizon.find(".cart-bubble__text-count").first();
   if ($countEl.length) {
    $countEl.removeClass("hidden");
    if (n === 0) $countEl.addClass("hidden");
    $countEl.text(` ${n}`);
   }
  }

  // Alpine themes render the number themselves and keep it in an Alpine store. Seed it with the
  // truth so the first paint is right even before Alpine boots.
  $c.find(ALPINE_COUNT).each((_: number, s: DomElement) => { $(s).text(String(n)); });

  // Dawn: rebuild the bubble we stripped above, inside the anchor it belongs to.
  const isDawn = $c.is("#cart-icon-bubble") || $c.hasClass("header__icon--cart") || $c.find(".cart-count-bubble").length > 0;
  if (isDawn) {
   if (n > 0) $c.append(dawnBubbleHtml(n));
  } else if (!$horizon.length && $c.find(ALPINE_COUNT).length === 0) {
   // 3. A theme with no count element of its own — give it ours.
   if (n > 0) {
    $c.attr("style", withRelativePosition($c.attr("style")));
    $c.append(vyaBadgeHtml(n));
   }
  }

  // 4. Labels last, so they describe what the badge now shows.
  const label = $c.attr("aria-label");
  if (label) $c.attr("aria-label", restateCountText(label, n));
 }

 // 5. And the control opens OUR drawer. Every hosted store showed two ways to reach the bag — the
 //    theme's icon and our floating pill — and a shopper could not tell which was real. The icon is
 //    the one they reach for, so it gets the job, and the body marker hides the pill (see the
 //    stylesheet in CART_UI). Where no control was found the pill stays: it is the only way in.
 if (controls.length) {
  bindIn($, controls);
  $("body").attr("data-vya-has-cart-control", "1");
 }

 // Screen-reader copy elsewhere in the header ("Total items in cart: 0") is part of the same lie.
 $('[class*="visually-hidden"], .sr-only, [class*="visuallyhidden"]').each((_: number, el: DomElement) => {
  const $el = $(el);
  if ($el.children().length) return;
  const t = $el.text();
  if (!/items? in (?:your )?cart/i.test(t)) return;
  const next = restateCountText(t, n);
  if (next !== t) $el.text(next);
 });

 return $.html();
}

/**
 * Does this page have a cart control of its own?
 *
 * Every hosted store currently shows TWO ways to reach the bag: the theme's own cart icon, and a
 * floating "Bag · N" pill we inject to open our drawer. A shopper cannot tell which is real, and the
 * theme's icon is the one they instinctively reach for.
 *
 * The icon already carries our live count (see applyCartBadge). It should open our drawer too — and
 * then the pill is redundant. The pill stays only where nothing else can open the bag, because
 * removing it there would strand the shopper with a cart they cannot see.
 */
export function hasCartControl(html: string): boolean {
 return cheerio.load(html)(CART_CONTROL_SELECTORS).length > 0;
}

/**
 * Point the theme's own cart control at our drawer.
 *
 * Marks every cart control with `data-vya-cart-open` — the drawer script opens on a click anywhere
 * inside one — and takes away its href so it cannot navigate to the theme's own cart page instead.
 * Themes routinely render two (desktop and mobile), so every one is bound, not just the first.
 */
export function bindCartControls(html: string): string {
 const $ = cheerio.load(html, undefined, false);
 const controls = $(CART_CONTROL_SELECTORS);
 if (!controls.length) return html;
 bindIn($, controls.toArray() as DomElement[]);
 return $.html();
}

/** The binding itself, so a caller already holding a parsed document does not parse it twice. */
function bindIn($: cheerio.CheerioAPI, controls: DomElement[]): void {
 for (const el of controls) {
  // Idempotent: this runs on every request, and a re-run must not stack `cursor:pointer` up.
  const style = ($(el).attr("style") || "").replace(/;?\s*$/, "");
  const withCursor = /(^|;)\s*cursor\s*:/i.test(style) ? style : `${style ? style + ";" : ""}cursor:pointer`;
  $(el).attr("data-vya-cart-open", "1").removeAttr("href").attr("style", withCursor);
 }
}
