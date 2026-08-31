// What a store origin does with a root-relative `/cdn/…` request.
//
// THE BUG THIS EXISTS FOR. A modern Shopify theme (Horizon and friends) ships an **import map**:
//
//   <script type="importmap">{"imports":{"@theme/component":"/cdn/shop/t/1/assets/component.js?v=…"}}</script>
//
// Those specifiers are ROOT-RELATIVE. On Shopify they resolve against the seller's own domain, which
// proxies Shopify's CDN under `/cdn/`. Served from a VYA store origin they resolve against US — and
// nothing here answered `/cdn/…`, so every module 404'd. Next's 404 is an HTML page, so the browser
// then reported "Refused to execute script … MIME type ('text/html')", every `@theme/*` import
// failed, and the theme's JavaScript — the entire reason Plan B exists — never ran. ~40 console
// errors on a single product page, and a storefront whose carousels, variant picker, quantity
// selector and cart drawer were all dead.
//
// Absolutizing the import map at capture time would fix new captures only. This runs at request
// time, so it also repairs every capture already in the database, and it catches URLs the theme
// builds dynamically (`new URL('/cdn/…', location)`), which no capture-time pass can see.
//
// The proxy is NOT a blind passthrough: the same allow/deny rules that decide which <script src> may
// run at capture time are applied here, because a root-relative path is exactly how Shopify's own
// telemetry and checkout bundles sneak back in.
import { classifyScript } from "./scripts.ts";

export type AssetPlan =
 | { action: "proxy"; url: string }
 /** Answered locally with a valid-but-empty body. `import()` of an empty ES module RESOLVES, so a
  *  theme that lazily pulls in Shop Pay gets a silent no-op instead of an unhandled rejection. */
 | { action: "inert"; contentType: string; body: string }
 | { action: "deny" };

/** Content types we can safely fake. Anything else is denied rather than guessed at. */
function inertFor(pathname: string): AssetPlan {
 if (/\.m?js$/i.test(pathname)) return { action: "inert", contentType: "text/javascript; charset=utf-8", body: "export {};\n" };
 if (/\.css$/i.test(pathname)) return { action: "inert", contentType: "text/css; charset=utf-8", body: "/* removed by VYA */\n" };
 if (/\.json$/i.test(pathname)) return { action: "inert", contentType: "application/json; charset=utf-8", body: "{}" };
 return { action: "deny" };
}

/**
 * Decide how to answer `GET /cdn/{...}` on a store origin.
 *
 * @param pathname  the request path, e.g. `/cdn/shop/t/1/assets/component.js`
 * @param search    the query string including `?`, e.g. `?v=7423…` (Shopify's asset fingerprint)
 * @param sourceOrigin the origin the store was captured from, e.g. `https://angearchive.com`
 */
export function planCdnRequest(pathname: string, search: string, sourceOrigin: string | null): AssetPlan {
 const p = pathname || "";
 // Only ever proxy under /cdn/. Checked on the RESOLVED path so `/cdn/../admin` can't walk out.
 if (!p.startsWith("/cdn/")) return { action: "deny" };
 if (!sourceOrigin) return { action: "deny" };

 let upstream: URL;
 try {
  upstream = new URL(p + (search || ""), sourceOrigin);
 } catch {
  return { action: "deny" };
 }
 // new URL() normalises `..`; re-check the result actually stayed inside /cdn/.
 if (!upstream.pathname.startsWith("/cdn/")) return { action: "deny" };
 if (upstream.origin !== new URL(sourceOrigin).origin) return { action: "deny" };

 // Same verdicts as capture time. `classifyScript` tests its patterns against the whole string
 // first, so a root-relative telemetry or checkout path is caught here even though the host is the
 // seller's own — which is precisely the case that got through before.
 const verdict = classifyScript(p + (search || ""), sourceOrigin);
 if (verdict === "vendor" || verdict === "checkout") return inertFor(p);

 return { action: "proxy", url: upstream.toString() };
}
