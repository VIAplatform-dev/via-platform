// The in-page storefront editor's save URLs, made store-aware. Pure — no I/O.
//
// The editor script (site-capture.ts, EDITOR_JS) runs INSIDE the captured page at
// /site/<slug>/…?edit=1 and posts to /api/store/capture/edit and /api/store/assets. Those routes
// resolve the acting store from the session — or, for an admin, from ?store=. Without the param an
// admin fixing a seller's page saved into via-admin. The slug is right there in the page's own path,
// so the script derives it and appends it; for a seller the server ignores ?store= (only admins may
// switch), so this is safe for everyone.
//
// The script embeds a verbatim ES5 copy of `withStoreParam` (it cannot import), so keep the two
// in step: the test here is the spec, site-capture.test.ts checks the copy is in the script.

const SITE_PATH = /^\/site\/([^/?#]+)/;

/** "/site/foo/about" → "foo"; anything not under /site/ → null. */
export function storeSlugFromPath(pathname: string): string | null {
 const m = SITE_PATH.exec(pathname || "");
 return m && m[1] ? m[1] : null;
}

/** Append ?store=<slug> (or &store= when the URL already has a query) when the page is /site/<slug>/…. */
export function withStoreParam(url: string, pathname: string): string {
 const slug = storeSlugFromPath(pathname);
 if (!slug) return url;
 return url + (url.indexOf("?") >= 0 ? "&" : "?") + "store=" + encodeURIComponent(slug);
}
