// Which captured pages the site itself actually leads to.
//
// A crawl finds every URL that answers, and a Shopify store answers on far more than it shows. Auto
// -created collections, one-off pages from an old campaign, an archived drop — they all still
// resolve, so they all get captured, and they all then appear in the editor's page strip looking
// exactly as live as the homepage. A seller scrolling that strip finds "Commission 7" sitting
// beside "New Arrivals" and reasonably concludes we have published something she retired.
//
// So: a page nothing links to is marked, greyed and sorted last. The word used is "Not linked",
// never "Archived" — because these pages ARE still reachable by anyone holding the URL, and telling
// her they're archived would be the same false reassurance pointing the other way. Hiding them from
// the storefront is a separate, deliberate action; this only stops the strip implying they're a
// featured part of her shop.

/** A link target reduced to the shape captured paths are stored in: leading slash, no query, no hash. */
export function normalizePath(href: string, origin?: string | null): string | null {
 const raw = String(href || "").trim();
 if (!raw) return null;
 // Anything that isn't a page on this site.
 if (/^(mailto:|tel:|sms:|javascript:|data:|#)/i.test(raw)) return null;

 let path = raw;
 if (/^https?:\/\//i.test(raw)) {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  // An absolute link to somewhere else is not a link to one of our pages.
  if (origin) {
   let host: string;
   try { host = new URL(/^https?:\/\//i.test(origin) ? origin : `https://${origin}`).hostname; } catch { host = ""; }
   if (host && u.hostname.replace(/^www\./, "") !== host.replace(/^www\./, "")) return null;
  }
  path = u.pathname;
 } else if (raw.startsWith("//")) {
  return null; // protocol-relative to another host
 } else if (!raw.startsWith("/")) {
  return null; // a relative link; the capture stores absolute paths, and guessing a base is worse
 } else {
  path = raw.split("#")[0].split("?")[0];
 }

 path = path.split("#")[0].split("?")[0];
 if (!path.startsWith("/")) path = `/${path}`;
 // "/collections/bottoms/" and "/collections/bottoms" are one page. "/" stays "/".
 if (path.length > 1) path = path.replace(/\/+$/, "");
 return path || "/";
}

/** Every same-site page this HTML links to. */
export function linkTargets(html: string, origin?: string | null): Set<string> {
 const out = new Set<string>();
 // Attribute-level regex rather than a DOM parse: this runs over a whole captured page (often close
 // to a megabyte) on an editor load, and every href in the document is all we need from it.
 const re = /<a\b[^>]*?\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
 let m: RegExpExecArray | null;
 while ((m = re.exec(html)) !== null) {
  const p = normalizePath(m[2] ?? m[3] ?? m[4] ?? "", origin);
  if (p) out.add(p);
 }
 return out;
}

/**
 * Split captured paths into the ones the site leads to and the ones it doesn't.
 *
 * `sourceHtml` is the pages we read links out of — in practice the homepage and, when it exists, the
 * collections index. Not every captured page: reading eighty megabytes of HTML to decorate a strip
 * of thumbnails would cost more than the feature is worth, and a page linked from nothing but a
 * single product page is not one a shopper finds either.
 *
 * The homepage is always treated as linked, whether or not anything points at it.
 */
export function partitionByReachability(
 paths: string[],
 sourceHtml: string[],
 origin?: string | null
): { linked: string[]; unlinked: string[] } {
 const targets = new Set<string>();
 for (const html of sourceHtml) for (const t of linkTargets(html, origin)) targets.add(t);

 const linked: string[] = [];
 const unlinked: string[] = [];
 for (const p of paths) {
  const norm = normalizePath(p) ?? p;
  const isHome = norm === "/" || norm === "";
  // A page that is its own source of links (the homepage, the collections index we read) is by
  // definition part of the site, even when nothing points back at it.
  if (isHome || targets.has(norm)) linked.push(p);
  else unlinked.push(p);
 }
 return { linked, unlinked };
}
