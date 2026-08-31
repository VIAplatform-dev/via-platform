// Which store (if any) a request's Host header belongs to — the foundation of "Plan B".
//
// Plan B serves a captured storefront from a SEPARATE REGISTRABLE DOMAIN so the browser's
// same-origin policy isolates the seller's JavaScript from VYA. That lets us keep their theme's own
// code running (carousels, filters, cart drawer, predictive search) instead of stripping it and
// rebuilding it in a shim, which is the only way to reach real 1-to-1 fidelity.
//
// A SUBDOMAIN OF vyaplatform.com WOULD NOT WORK. `store.vyaplatform.com` and `vyaplatform.com` are
// *same-site*, so a hostile script on a store page could set cookies for the parent domain
// ("cookie tossing") — isolation requires a different registrable domain, not a different host.
//
// The suffix is configuration, not a constant, so the same code runs against `.vyasites.test`
// locally (an /etc/hosts entry; `.test` is reserved by RFC 6761 and never resolves publicly) and
// `.vyasites.com` in production. Everything here is pure and unit tested.

/** Hosts that are VYA itself — never a store origin, whatever else is configured. */
const VYA_HOSTS = ["vyaplatform.com", "getvya.ai"];

/** The configured store-origin suffix, e.g. ".vyasites.com". Empty when Plan B is switched off. */
export function storeHostSuffix(env: Record<string, string | undefined> = process.env): string {
 const raw = (env.STORE_HOST_SUFFIX || "").trim().toLowerCase();
 if (!raw) return "";
 return raw.startsWith(".") ? raw : `.${raw}`;
}

/** Strip port and normalise. `Store.VYASites.test:3000` → `store.vyasites.test`. */
export function normalizeHost(host: string | null | undefined): string {
 return (host || "").trim().toLowerCase().split(":")[0].replace(/\.$/, "");
}

/**
 * The store slug this host serves, or null when the host is VYA itself (or unconfigured).
 *
 * Deliberately strict: only a DIRECT child of the suffix is a store. `a.b.vyasites.com` returns
 * null rather than treating "a.b" as a slug — a wildcard certificate only covers one label anyway,
 * and accepting deeper names would let an attacker-shaped hostname masquerade as a store.
 */
export function storeSlugForHost(host: string | null | undefined, env: Record<string, string | undefined> = process.env): string | null {
 const h = normalizeHost(host);
 const suffix = storeHostSuffix(env);
 if (!h || !suffix) return null;
 // A VYA host is never a store origin, even if someone points the suffix at one by mistake.
 if (VYA_HOSTS.some((v) => h === v || h.endsWith(`.${v}`))) return null;
 if (!h.endsWith(suffix)) return null;
 const label = h.slice(0, -suffix.length);
 if (!label || label.includes(".")) return null;
 // Same shape as every other store slug in the system.
 if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(label)) return null;
 // Reserved names that must never resolve to a seller's storefront.
 if (["www", "admin", "api", "app", "store", "portal", "internal"].includes(label)) return null;
 return label;
}

export function isStoreHost(host: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
 return storeSlugForHost(host, env) !== null;
}

/**
 * Paths that must NEVER be reachable on a store origin.
 *
 * This is SECURITY, not tidiness. A store origin runs the seller's own JavaScript; if VYA's admin,
 * portal or internal APIs answered there, that script could drive them with the visitor's cookies.
 * The storefront needs only its own public surface, so this is a denylist of everything else,
 * written to fail closed on anything unrecognised under /api.
 */
export function isRefusedOnStoreHost(pathname: string): boolean {
 const p = (pathname || "/").toLowerCase();
 // VYA's own operator and seller surfaces.
 if (/^\/(admin|store|dashboard|onboarding|internal)(\/|$)/.test(p)) return true;
 if (/^\/api\//.test(p)) return !isAllowedStoreApi(p);
 return false;
}

/**
 * The only APIs a store origin may call: the storefront's own public surface, plus the Shopify-shaped
 * cart/search endpoints the seller's theme talks to. An allowlist, so adding a new internal route
 * can't accidentally expose it on 45 seller domains.
 */
export function isAllowedStoreApi(pathname: string): boolean {
 const p = (pathname || "").toLowerCase();
 return (
  p.startsWith("/api/storefront/") ||
  p.startsWith("/api/cart/") ||
  p === "/api/cart" ||
  p.startsWith("/api/search/") ||
  p.startsWith("/api/track") ||
  p.startsWith("/api/auth/") ||
  // "You may also like". The seller's own theme fetches this from the shopper's browser, so it is
  // a storefront surface — but it lives under /api/plan-b/, which this list does not cover, so
  // every request from a hosted store was refused before reaching the handler and the strip
  // rendered empty for ever. Exactly ONE route, not the /api/plan-b/ prefix: the rest of that
  // namespace is internal and must stay refused on 45 sellers' domains.
  p === "/api/plan-b/recommendations" ||
  // Squarespace's cart, in its own dialect. Unlike Shopify's /cart/* routes these live UNDER /api,
  // so without this the refusal above 404s the seller's own Add-to-cart before middleware ever gets
  // to rewrite it. Only the cart: the rest of Squarespace's /api surface stays refused.
  squarespaceThemeRoute(p) !== null
 );
}

/**
 * A Shopify theme's own endpoints → VYA's implementations of them.
 *
 * Themes call both the bare and the `.js`/`.json` forms depending on theme version, so both are
 * mapped — missing one shows up to a shopper as a dead Add-to-cart button. These are exactly the
 * five routes the theme publishes into the page as relative paths, which is what makes Plan B work.
 */
export function shopifyThemeRoute(pathname: string): string | null {
 const p = (pathname || "/").replace(/\/+$/, "").toLowerCase() || "/";
 if (p === "/cart.js" || p === "/cart.json") return "/api/plan-b/cart";
 if (p === "/cart/add" || p === "/cart/add.js") return "/api/plan-b/cart/add";
 if (p === "/cart/change" || p === "/cart/change.js") return "/api/plan-b/cart/change";
 if (p === "/cart/update" || p === "/cart/update.js") return "/api/plan-b/cart/update";
 if (p === "/search/suggest" || p === "/search/suggest.json") return "/api/plan-b/search/suggest";
 // Every theme's product page asks for a "You may also like" strip here. Left unrouted it 404s, and
 // the theme logs `Product recommendations error: Server returned 404` on every product view.
 if (p === "/recommendations/products") return "/api/plan-b/recommendations";
 return null;
}

/**
 * The theme's cart FORM — a POST to /cart, which is a different thing from the GET that renders the
 * cart page, so this is deliberately method-aware where shopifyThemeRoute is not.
 *
 * Shopify's cart page and cart drawer are one form with two submit buttons, `update` and `checkout`,
 * both posting here. That makes this the route a shopper actually reaches checkout through: an audit
 * of the stored captures found the form on 16 of 18 Shopify stores, and on 7 of them the drawer
 * carrying it sits in the header of EVERY page. Unrouted, the POST fell through to Next, which
 * answered "Server action not found" — a dead Checkout button at the moment of buying.
 *
 * Which button was pressed is decided in cart-submit.ts, not here.
 */
export function shopifyCartSubmitRoute(pathname: string, method: string): string | null {
 if ((method || "").toUpperCase() !== "POST") return null;
 const p = (pathname || "/").replace(/\/+$/, "").toLowerCase() || "/";
 return p === "/cart" ? "/api/plan-b/cart/submit" : null;
}

/**
 * The same thing for a SQUARESPACE theme's own route table.
 *
 * Squarespace's storefront bundle is one file shared by every Squarespace store, so — like the
 * Shopify table above — one mapping covers every Squarespace seller. Its cart lives behind
 * /api/commerce/shopping-cart (verified in commerce-*.js, which posts there from the product page's
 * Add-to-cart button); the entry-level PUT carries an entry id in the path, hence the prefix match.
 */
export function squarespaceThemeRoute(pathname: string): string | null {
 const p = (pathname || "/").replace(/\/+$/, "").toLowerCase() || "/";
 if (p === "/api/commerce/shopping-cart") return "/api/plan-b/sqs/cart";
 if (p === "/api/commerce/shopping-cart/entries") return "/api/plan-b/sqs/cart/entries";
 return null;
}

/**
 * Where Squarespace's own Checkout buttons send a shopper — VYA's checkout, with their VYA cart.
 *
 * Its bundle hard-codes `window.top.location = "/commerce/goto-checkout"` (from the mini-cart's
 * Checkout button and the cart page's), which on the source store is a redirector into Squarespace's
 * hosted checkout. VYA is the checkout now, so it lands on ours instead — a REDIRECT rather than a
 * rewrite, because the shopper is leaving the seller's captured site for a VYA-rendered page and the
 * address bar should say so.
 */
export function squarespaceCheckoutRedirect(pathname: string): string | null {
 const p = (pathname || "/").replace(/\/+$/, "").toLowerCase() || "/";
 return p === "/commerce/goto-checkout" ? "/checkout?cart=1" : null;
}

/**
 * Paths on a store origin that VYA's OWN app serves, rather than the captured site.
 *
 * Checkout is the whole point of the swap: the theme's cart page links to /checkout, and that has to
 * reach VYA's Stripe flow. Rewriting it to /site/{slug}/checkout looked for a captured page that
 * never existed, so the shopper hit "Page not found" one click from paying.
 */
export function isVyaOwnedPath(pathname: string): boolean {
 const p = (pathname || "/").toLowerCase().replace(/\/+$/, "") || "/";
 return p === "/checkout" || p.startsWith("/checkout/");
}
