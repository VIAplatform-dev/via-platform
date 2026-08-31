/**
 * Which of a seller's pages did we genuinely fail to copy?
 *
 * A Shopify shop selling into several markets lists every page once per language in its sitemap:
 * `/collections/heels` and `/ja/collections/heels` are the same page, rendered twice. Comparing the
 * sitemap against what we captured therefore reported the translations as missing pages — 47 of them
 * on ascensio-demo, which is the whole of that store's "pages not copied" finding.
 *
 * The rule is deliberately narrow. A first segment only counts as a language when removing it
 * reveals a page we actually hold, so a collection called `/eu` or a page called `/uk/pages/about`
 * is still reported. Excusing anything that merely looks like a language would hide real gaps behind
 * a two-letter prefix.
 */

/** `ja`, `en-gb`, `pt-BR` — a language, optionally with a region. */
const LOCALE_SEGMENT = /^[a-z]{2}(?:-[a-z]{2})?$/i;

const normalise = (p: string) => (p || "").replace(/\/+$/, "") || "/";

/** The page this one would be a translation of, or null when the first segment isn't a language. */
export function withoutLocale(path: string): string | null {
 const p = normalise(path);
 const m = /^\/([^/]+)(\/.*)?$/.exec(p);
 if (!m || !LOCALE_SEGMENT.test(m[1])) return null;
 return normalise(m[2] || "/");
}

/**
 * @param missing paths in the seller's sitemap that we did not capture
 * @param captured every path we DID capture, normalised without a trailing slash
 */
export function pagesGenuinelyMissing(missing: string[], captured: Set<string>): string[] {
 return missing.filter((p) => {
  const base = withoutLocale(p);
  // Not a translation, or a translation of something we do not hold either — a real gap.
  return base === null || !captured.has(base);
 });
}
