// Making the theme's own assets same-origin, so the browser will actually load them.
//
// THE FAILURE THIS FIXES. A browser sweep of all 22 hosted storefronts found that on most of them
// the theme's JavaScript never executes at all. One store alone served 39 cross-origin scripts, 35
// of them ES modules:
//
//   <script type="module" src="https://angearchive.com/cdn/shop/t/1/assets/quick-add.js?v=1020">
//
// An ES module fetched cross-origin REQUIRES CORS headers. The seller's own Shopify domain does not
// send `Access-Control-Allow-Origin` for our origin, so Chrome refuses every one of them:
//
//   Access to script at 'http://angearchive.com/cdn/…' from origin
//   'http://ange-archive.vyasites.test:3333' has been blocked … net::ERR_FAILED
//
// The consequence is far bigger than any cart bug. That JavaScript is the theme's menus, carousels,
// mobile navigation, image galleries, filters, quick-add AND its cart. On those stores none of it
// runs — Add to cart is a button with nothing bound to it, and the storefront is inert.
//
// THE FIX. VYA already proxies the theme's assets at /cdn/* (app/cdn/[...path]/route.ts), fetching
// them from the captured origin server-side. Pointing the page at that path makes every asset
// same-origin, which removes the CORS question entirely — a same-origin module needs no headers.
//
// Applied at SERVE time rather than capture time, deliberately: it fixes all 22 stores on the next
// request instead of after 22 re-imports.
//
// Pure: HTML in, HTML out.
import * as cheerio from "cheerio";
import type { Element as DomEl } from "domhandler";

/** Attributes that carry an asset URL, and the elements that carry them. */
const ASSET_ATTRS: { sel: string; attr: string }[] = [
 { sel: "script[src]", attr: "src" },
 { sel: "link[href]", attr: "href" },
 { sel: "img[src]", attr: "src" },
 { sel: "source[src]", attr: "src" },
];

/** Hosts that count as "this store's own". */
function ownHosts(captureOrigin: string, myshopifyDomain?: string | null): Set<string> {
 const hosts = new Set<string>();
 try { hosts.add(new URL(captureOrigin).host.toLowerCase().replace(/^www\./, "")); } catch { /* unparseable origin */ }
 if (myshopifyDomain) hosts.add(myshopifyDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase());
 return hosts;
}

/**
 * The same-origin path for a URL, or null to leave it alone.
 *
 * Only `/cdn/…` is rewritten. That is the one path shape the proxy knows how to serve; pointing the
 * browser at any other VYA path would swap a CORS failure for a 404.
 */
function proxied(raw: string, hosts: Set<string>): string | null {
 if (!raw) return null;
 const trimmed = raw.trim();
 // Protocol-relative ("//host/path") and absolute ("https://host/path") are the two forms captures
 // produce; anything already relative is either fine or not ours to touch.
 if (!/^(https?:)?\/\//i.test(trimmed)) return null;
 let u: URL;
 try { u = new URL(trimmed.startsWith("//") ? `https:${trimmed}` : trimmed); } catch { return null; }
 if (!hosts.has(u.host.toLowerCase().replace(/^www\./, ""))) return null;
 if (!u.pathname.startsWith("/cdn/")) return null;
 return `${u.pathname}${u.search}`;
}


/**
 * The same rewrite, applied to a blob of text rather than an attribute.
 *
 * Handles both the plain form (`https://host/cdn/…`) and the escaped form JSON-inside-JavaScript
 * produces (`https:\/\/host\/cdn\/…`), and the protocol-relative variants of each. Only `/cdn/`
 * is touched, so a mention of the store's domain anywhere else in the script is left alone.
 */
function rewriteUrlsInText(text: string, hosts: Set<string>): string {
 let out = text;
 for (const host of hosts) {
  const h = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // https://host/cdn/  |  //host/cdn/  — with an optional leading www.
  out = out.replace(new RegExp(`(https?:)?//(www\\.)?${h}/cdn/`, "gi"), "/cdn/");
  // the same, with every slash escaped, as JSON embedded in JS writes it
  out = out.replace(new RegExp(`(https?:)?\\\\/\\\\/(www\\.)?${h}\\\\/cdn\\\\/`, "gi"), "\\/cdn\\/");
 }
 return out;
}

/**
 * Repoint every asset the store serves from its own domain at VYA's `/cdn` proxy.
 *
 * `captureOrigin` is the site we captured (site_captures.source_url); `myshopifyDomain` is the
 * store's `.myshopify.com` address where known, since themes reference both interchangeably.
 */
export function sameOriginAssets(html: string, captureOrigin: string | null, myshopifyDomain?: string | null): string {
 if (!html || !captureOrigin) return html;
 const hosts = ownHosts(captureOrigin, myshopifyDomain);
 if (!hosts.size) return html;

 try {
  const $ = cheerio.load(html);
  let changed = 0;
  for (const { sel, attr } of ASSET_ATTRS) {
   for (const el of $(sel).toArray() as DomEl[]) {
    const $el = $(el);
    const next = proxied($el.attr(attr) || "", hosts);
    if (next) { $el.attr(attr, next); changed++; }
   }
   // srcset carries several URLs at once, each optionally followed by a descriptor.
   for (const el of $(sel.replace("[src]", "[srcset]").replace("[href]", "[srcset]")).toArray() as DomEl[]) {
    const $el = $(el);
    const raw = $el.attr("srcset");
    if (!raw) continue;
    const rewritten = raw.split(",").map((part) => {
     const [url, ...rest] = part.trim().split(/\s+/);
     const next = proxied(url, hosts);
     return [next ?? url, ...rest].join(" ");
    }).join(", ");
    if (rewritten !== raw) { $el.attr("srcset", rewritten); changed++; }
   }
  }
  // Import maps and inline scripts. Modern Shopify themes resolve most of their modules through an
  // IMPORT MAP, and reference more assets from inside inline scripts — neither of which is a src
  // attribute, so the attribute pass above never sees them. On one store that left 21 map specifiers
  // and 29 inline references still pointing cross-origin, and the theme still could not boot.
  for (const el of $("script").toArray() as DomEl[]) {
   const $el = $(el);
   if ($el.attr("src")) continue; // external scripts were handled above
   // Write straight to the text node. cheerio's .text() setter builds a new Text node, which is
   // HTML-escaped on serialisation — inside a <script> that corrupts the JavaScript (`&&` becomes
   // `&amp;&amp;`), so the rewrite appeared to do nothing and the page shipped broken code.
   const node = (el.children || [])[0] as unknown as { type?: string; data?: string } | undefined;
   if (!node || typeof node.data !== "string" || !node.data) continue;
   const next = rewriteUrlsInText(node.data, hosts);
   if (next !== node.data) { node.data = next; changed++; }
  }

  return changed ? $.html() : html;
 } catch {
  return html; // an asset rewrite is never worth failing a page render for
 }
}
