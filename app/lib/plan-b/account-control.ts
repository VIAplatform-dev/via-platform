/**
 * The person icon in a seller's own header, bound to OUR sign-in.
 *
 * 20 of the 23 hosted stores already carry one — a link to `/account`, a `customer_login` form, or
 * an icon classed for it. The three that do not are the same three that are not on Shopify. So
 * rather than bolting a VYA button onto somebody's header, we use the control a shopper already
 * reaches for, exactly as the cart icon now opens our drawer instead of the theme's.
 *
 * Its own destination has to go. Left alone it sends the shopper to the platform's login page —
 * which on a store that has left Shopify is a dead end, and on one that has not is an account with
 * the wrong shop.
 *
 * Signing in here makes someone THAT SELLER's customer and nothing more; the marketplace is a
 * separate, deliberate act. See app/lib/shopper-session.ts.
 */
import * as cheerio from "cheerio";
import type { Element as DomElement } from "domhandler";

/**
 * Controls that mean "sign in" or "my account".
 *
 * Deliberately excludes logout — a shopper clicking "Log out" has not asked to sign in — and is kept
 * away from anything cart-shaped, since both are header icons and binding the wrong one would open
 * sign-in when someone meant to open their bag.
 */
export const ACCOUNT_SELECTOR_LIST: string[] = [
 'a[href="/account"]',
 'a[href^="/account/login"]',
 'a[href^="/account?"]',
 'a[href*="/customer_authentication"]',
 'a[href*="shopify.com/"][href*="/account"]',
 "#customer_login",
 '[class*="header__icon--account" i]',
 '[class*="icon-account" i]',
 '[class*="account-icon" i]',
 'a[aria-label*="account" i]',
 'button[aria-label*="account" i]',
 'a[aria-label*="log in" i]',
 'button[aria-label*="log in" i]',
 'a[aria-label*="sign in" i]',
 'button[aria-label*="sign in" i]',
 // Shopify's own account web component. Its icon lives in a shadow root where no selector reaches
 // it, but a click inside a shadow root is retargeted to the host on the way out — so binding the
 // host catches it, and our window capture stops the event before the component's handler runs.
 "shopify-account",
 '[class*="account-button" i]',
];

/**
 * The list as one selector string.
 *
 * Exported because the SERVER is not the only place that binds. Shopify's newer themes build their
 * header in JavaScript after the page loads — the account button simply is not in the HTML we
 * receive — so the page binds again in the browser using this exact list. Two binders, one list:
 * if they ever drift, one of them stops matching the thing that ships.
 */
export const ACCOUNT_SELECTORS = ACCOUNT_SELECTOR_LIST.join(",");
/** The same exclusion, as a source string the injected script rebuilds a RegExp from. */
export const NOT_ACCOUNT_SOURCE = "logout|log out|sign out|signout";

/** Never these, however they are labelled. */
const NOT_ACCOUNT = new RegExp(NOT_ACCOUNT_SOURCE, "i");

function controlsIn($: cheerio.CheerioAPI): DomElement[] {
 return ($(ACCOUNT_SELECTORS).toArray() as DomElement[]).filter((el) => {
  const $el = $(el);
  const text = `${$el.attr("href") || ""} ${$el.attr("aria-label") || ""} ${$el.text() || ""}`;
  if (NOT_ACCOUNT.test(text)) return false;
  // A control nested inside another match would otherwise be bound twice.
  return $el.parents(ACCOUNT_SELECTORS).length === 0;
 });
}

export function hasAccountControl(html: string): boolean {
 if (!html || !/account|customer_login|sign ?in|log ?in/i.test(html)) return false;
 return controlsIn(cheerio.load(html, undefined, false)).length > 0;
}

/**
 * Point the theme's own account control at our sign-in.
 *
 * @param opts.signedInAs marks the control so the page can show "your account" rather than "log in".
 */
export function bindAccountControls(html: string, opts: { signedInAs?: string | null } = {}): string {
 if (!html) return html;
 // A WHOLE DOCUMENT, not a fragment. Parsed as a fragment, parse5 discards the <body> tag and keeps
 // only its children — which silently threw away `data-vya-has-cart-control` and put the floating
 // bag pill back on all 20 stores that already have a cart icon. Read-only callers may parse
 // loosely; anything that hands the page back must hand back the same document.
 const $ = cheerio.load(html);
 const controls = controlsIn($);
 if (!controls.length) return html; // untouched, byte for byte — nothing to bind
 for (const el of controls) {
  const $el = $(el);
  const style = ($el.attr("style") || "").replace(/;?\s*$/, "");
  // Idempotent: this runs on every request and must not stack declarations up.
  const withCursor = /(^|;)\s*cursor\s*:/i.test(style) ? style : `${style ? style + ";" : ""}cursor:pointer`;
  $el.attr("data-vya-account-open", "1").removeAttr("href").attr("style", withCursor);
  if (opts.signedInAs) {
   $el.attr("data-vya-account-signed-in", "1");
   if ($el.attr("aria-label")) $el.attr("aria-label", "Your account");
  }
 }
 return $.html();
}
