// Which page a captured store keeps each of its products on — read off the store's own catalogue.
//
// WHY THIS EXISTS. captured-product-path.ts finds a product's page by its handle, and failing that
// by slugifying its title, because that is how these platforms build handles. It gets most of them.
// It cannot get the rest: Squarespace hands a product a RANDOM slug when the seller never typed one
// ("Christian Louboutin So Kate – Pink Suede" lives at `/shop/p/d1djte223uh5vh70ab962ibspzd4z3`),
// and no amount of slugifying will produce that. Those pieces stayed on the error page.
//
// The store already told us the answer. Every captured collection page is a list of the store's
// products — a link to each one, labelled with its name (an `aria-label`, an image `alt`, or the
// link's own text; the three conventions between them cover every storefront we capture). Read those
// pairs out ONCE per store and the mapping from a product's NAME to its own page is exact, whatever
// the platform chose to call the URL.
//
// Kept in a reserved capture row like the cart and recommendation templates (see
// cart-template-store.ts) and for the same reason: it describes THIS capture, so re-importing must
// throw it away with the pages it was read from.
//
// NEVER GUESSES BETWEEN TWO PIECES. One-of-one vintage stores really do list two garments under one
// name — this store has two products both called "Christian Louboutin So Kate". An index that
// resolved that name to whichever it saw first would send half of those shoppers to the other shoe.
// An ambiguous name resolves to nothing and the caller falls back, which is the same rule the rest
// of the import pipeline follows about matching on titles.
import { getCapturePage, listCapturePaths, saveCapturePage } from "../site-capture-db.ts";
import { isProductPagePath } from "./captured-product-path.ts";

/** Reserved: not a page, and never served (see isReservedCapturePath). */
export const PRODUCT_INDEX_PATH = "/__vya/product-index";

/** `version` is the EXTRACTOR's version, not the shape's. A stored index is only as good as the
 *  reader that built it — the first one matched a few short anchors and missed 189 of this store's
 *  192 products, and a row like that is indistinguishable from a small catalogue once it is written.
 *  Bump this whenever extractProductLinks() learns to see more, and every store rebuilds. */
export type ProductIndex = { version: 2; entries: { title: string; path: string }[] };

/** How many captured pages the index is built from. A store's catalogue is listed on a handful of
 *  collection pages; loading every page it has (some are megabytes) to find a few more links is not
 *  worth what it costs. Ordered by how likely a page is to list the whole catalogue. */
const MAX_SOURCE_PAGES = 10;

/**
 * The product links on one captured page: each product's own page, and the name it was listed under.
 *
 * Raw-string work on purpose. These pages run to several megabytes and cheerio takes ~180ms on one.
 * Only the OPENING tag is matched, and the name is looked for in a window of what follows: a real
 * product card is well over a thousand characters of markup, so a pattern that had to reach the
 * closing `</a>` matched nothing at all on a real page while passing happily on a small fixture.
 *
 * `sitePrefix` is the `/site/{slug}` a Plan A capture baked into its links; stripped so the paths
 * stored here are the store's own, whichever origin the page is later served from.
 */
const CONTENT_WINDOW = 1200;

export function extractProductLinks(html: string, sitePrefix?: string): { title: string; path: string }[] {
 const page = html || "";
 const out: { title: string; path: string }[] = [];
 const seen = new Set<string>();
 for (const m of page.matchAll(/<a\b([^>]*)>/gi)) {
  const path = normalizePath(attr(m[1], "href"), sitePrefix);
  if (!path || !isProductPagePath(path)) continue;
  const start = (m.index ?? 0) + m[0].length;
  // The card's markup up to its closing tag — or as much of it as the window holds, which is all
  // the name has ever needed.
  const content = page.slice(start, start + CONTENT_WINDOW).split(/<\/a>/i)[0];
  const title = decode(
   attr(m[1], "aria-label")     // the link labels itself (Squarespace, and any accessible theme)
   || attr(content, "alt")      // the product photo names the piece
   || content.replace(/<[^>]*>/g, " "), // the link's own text
  ).replace(/\s+/g, " ").trim();
  if (!title || title.length > 200) continue;
  const key = `${title.toLowerCase()}|${path}`;
  if (seen.has(key)) continue;
  seen.add(key);
  out.push({ title, path });
 }
 return out;
}

/**
 * The page for a product NAME, or null when the store's catalogue can't say for certain.
 *
 * Null covers both "nothing by that name" and "more than one thing by that name, on different
 * pages" — see the note at the top about why the second must never be resolved by picking one.
 */
export function pickIndexedPath(index: ProductIndex | null, title: string): string | null {
 const want = norm(title);
 if (!index || !want) return null;
 const paths = new Set(index.entries.filter((e) => norm(e.title) === want).map((e) => e.path));
 return paths.size === 1 ? [...paths][0] : null;
}

/** The store's catalogue index, built and stored the first time it's asked for. */
export async function productIndexFor(slug: string): Promise<ProductIndex | null> {
 const stored = await loadProductIndex(slug);
 if (stored) return stored;
 const built = await buildProductIndex(slug);
 if (!built.entries.length) return null;
 await saveCapturePage(slug, PRODUCT_INDEX_PATH, JSON.stringify(built), "").catch(() => {});
 return built;
}

export async function loadProductIndex(slug: string): Promise<ProductIndex | null> {
 const raw = await getCapturePage(slug, PRODUCT_INDEX_PATH).catch(() => null);
 if (!raw) return null;
 try {
  const parsed = JSON.parse(raw) as ProductIndex;
  return parsed?.version === 2 && Array.isArray(parsed.entries) ? parsed : null;
 } catch {
  return null;
 }
}

/**
 * Read the catalogue off the store's own listing pages.
 *
 * Product pages are skipped — they list a couple of "you may also like" neighbours at most, and
 * there are hundreds of them. What's left (the home page, the shop, each category) is where a store
 * lists what it sells.
 */
export async function buildProductIndex(slug: string): Promise<ProductIndex> {
 const paths = (await listCapturePaths(slug).catch(() => [] as string[]))
  .filter((p) => !isProductPagePath(p))
  .sort(byLikelihoodOfListingEverything)
  .slice(0, MAX_SOURCE_PAGES);
 const entries: { title: string; path: string }[] = [];
 const seen = new Set<string>();
 for (const p of paths) {
  const html = await getCapturePage(slug, p).catch(() => null);
  if (!html) continue;
  for (const e of extractProductLinks(html, `/site/${slug}`)) {
   const key = `${e.title.toLowerCase()}|${e.path}`;
   if (seen.has(key)) continue;
   seen.add(key);
   entries.push(e);
  }
 }
 return { version: 2, entries };
}

/** A store's "everything" page first, then its categories, then the rest. */
function byLikelihoodOfListingEverything(a: string, b: string): number {
 const rank = (p: string) => (/^\/(shop|collections\/all|products|store|catalog)\/?$/i.test(p) ? 0 : p === "/" ? 2 : 1);
 return rank(a) - rank(b) || a.length - b.length;
}

function normalizePath(href: string, sitePrefix?: string): string | null {
 let path = (href || "").trim();
 if (!path) return null;
 if (/^https?:\/\//i.test(path)) {
  try { path = new URL(path).pathname; } catch { return null; }
 }
 if (!path.startsWith("/")) return null;
 if (sitePrefix && path.toLowerCase().startsWith(`${sitePrefix.toLowerCase()}/`)) path = path.slice(sitePrefix.length);
 return path.replace(/\/+$/, "") || null;
}

function attr(source: string, name: string): string {
 return new RegExp(`\\b${name}="([^"]*)"`, "i").exec(source || "")?.[1] || "";
}

/** HTML entities in a product's name, decoded.
 *
 *  The NUMERIC forms are not optional here. A store writes "So Kate &#8211; Pink Suede" (an en
 *  dash) and the feed the VYA item was imported from writes the character itself; left encoded, the
 *  digits survive normalisation as a word ("… so kate 8211 pink suede") and the two names never
 *  match, which is the whole job of this file. */
function decode(s: string): string {
 return (s || "")
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeChar(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, dec) => safeChar(Number(dec)))
  .replace(/&apos;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&"); // last: an escaped "&amp;amp;" must not become a live entity
}

function safeChar(code: number): string {
 return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

function norm(s: string): string {
 return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
