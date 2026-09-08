/**
 * What would stop serving the day a seller cancels Shopify.
 *
 * The blackout gate blocks these and reloads the page: whatever disappears is what the shopper
 * would lose. Getting the list wrong in either direction makes the gate lie —
 *
 *   too narrow, and assets that WOULD die pass the gate. The seller's own domain is the example:
 *   blummier.com is her Shopify custom domain, and not blocking it scored 15 of 23 stores as
 *   surviving on stylesheets, scripts and fonts that would go dark for real.
 *
 *   too wide, and healthy stores are reported broken. That is the bug this module exists to end:
 *   the rule matched "myshopify.com" and "/cdn/" anywhere in the URL STRING, so
 *   `instafeed.nfcube.com/cdn/instafeed.css` and `cdn.nfcube.com/instafeed.js?shop=x.myshopify.com`
 *   were aborted — an Instagram widget app with no connection to Shopify at all. That single
 *   mistake accounted for 115 of 213 "lost images" and 6 of 7 "lost videos" across four stores.
 *
 * So the decision is made on the HOST, and only on the host — with ONE path-shaped exception, our
 * own `/cdn/` proxy, explained on isProxiedFromSeller() below.
 */

/** Shopify's own infrastructure. Matched as a domain suffix, never as a substring. */
const SHOPIFY_HOSTS = [
 "myshopify.com",
 "shopify.com",
 "shopifysvc.com",
 "shopifycloud.com",
 "shop.app",
];

const hostOf = (url: string): string | null => {
 try { return new URL(url).host.replace(/^www\./, "").toLowerCase(); } catch { return null; }
};

/** Is `host` that domain, or a subdomain of it? */
const under = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/**
 * THE ONE EXCEPTION TO "HOST ONLY": our own `/cdn/` path.
 *
 * `/cdn/…` on a store origin is not ours to serve. app/cdn/[...path] takes the request and fetches
 * the file from the seller's live site at that moment (see that route: the upstream origin comes
 * from our database, the path from the request). Same-origin to the browser; a round trip to her
 * Shopify in reality.
 *
 * So the gate could not see it. It never blocks our own host, our /cdn proxy answered 200 because
 * her shop was still up, and a page whose stylesheet is fetched through it was scored as surviving
 * cancellation. On tesselizabethvintage that stylesheet is 86KB of the design that makes the site
 * look like hers — it would have gone dark on the day the gate exists to predict.
 *
 * A blocked /cdn request is exactly what her cancelled shop would produce for it, which is the
 * whole point of the exercise.
 */
function isProxiedFromSeller(url: string): boolean {
 try { return new URL(url).pathname.toLowerCase().startsWith("/cdn/"); } catch { return false; }
}

/**
 * @param url        the request the page is making.
 * @param sellerHost the seller's own domain (her Shopify custom domain), or null if unknown.
 * @param ourHost    the host WE are serving the store from — never blocked (except /cdn/, above),
 *                   or nothing loads.
 */
export function blocksAtCancellation(url: string, sellerHost: string | null, ourHost: string | null): boolean {
 const host = hostOf(url);
 // Not a network request we can judge — data:, blob:, or malformed. Never block it.
 if (!host) return false;
 if (ourHost && under(host, ourHost.replace(/^www\./, "").toLowerCase().split(":")[0])) {
  return isProxiedFromSeller(url);
 }
 if (SHOPIFY_HOSTS.some((d) => under(host, d))) return true;
 if (sellerHost && under(host, sellerHost.replace(/^www\./, "").toLowerCase())) return true;
 return false;
}
