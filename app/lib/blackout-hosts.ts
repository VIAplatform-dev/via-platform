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
 * So the decision is made on the HOST, and only on the host.
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
 * @param url        the request the page is making.
 * @param sellerHost the seller's own domain (her Shopify custom domain), or null if unknown.
 * @param ourHost    the host WE are serving the store from — never blocked, or nothing loads.
 */
export function blocksAtCancellation(url: string, sellerHost: string | null, ourHost: string | null): boolean {
 const host = hostOf(url);
 // Not a network request we can judge — data:, blob:, or malformed. Never block it.
 if (!host) return false;
 if (ourHost && under(host, ourHost.replace(/^www\./, "").toLowerCase().split(":")[0])) return false;
 if (SHOPIFY_HOSTS.some((d) => under(host, d))) return true;
 if (sellerHost && under(host, sellerHost.replace(/^www\./, "").toLowerCase())) return true;
 return false;
}
