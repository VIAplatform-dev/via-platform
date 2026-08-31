// Finding the page a captured store already has for one of its own products.
//
// THE BUG THIS FIXES. Every live item on a mirrored storefront links to `/products/{something}` —
// the source's handle when the import recorded one, and the VYA item's uuid when it didn't. The
// product route then looks for a captured page at exactly `/products/{that}`, and when there isn't
// one it re-captures `{origin}/products/{that}` from the source. Both steps assume SHOPIFY's URL
// shape. A Squarespace store keeps its product pages at `/shop/p/{slug}`, so for those stores the
// lookup missed, the re-capture 404'd, and every product click on the mirrored site ended at
// "Couldn't load that product." — even though the right page was already in our capture table.
//
// (The Squarespace feed reader is also where the missing identity comes from: it reads
// `?format=json`, which carries `id`, `urlSlug` and `fullUrl` per product, and kept none of them.
// That's fixed at the source too, but it only helps stores imported from now on — the pages of the
// ones already imported still have to be findable, which is what this module is for.)
//
// HOW. Not by enumerating each platform's URL scheme — the same reason productGrids() doesn't
// enumerate theme class names. We already hold the list of every path this store captured, so the
// question "does this store have a page for this product?" is answered by looking for a captured
// page whose LAST SEGMENT is the product's key (its source handle, or its title slugified the way
// every one of these platforms slugifies it). The path can then be any shape at all.
//
// Guessing a path is only safe if the guess is CHECKED, so nothing here is trusted on its own: the
// caller confirms the page it finds actually names this product before serving it (see
// pageNamesProduct). A near-miss on a one-of-one vintage store means showing a shopper a different
// garment than the one they clicked, which is worse than the error page this replaces.

/** Segments that mean "a product lives under here" on some platform's URLs.
 *
 *  `shop` is deliberately NOT one of them: Squarespace's product pages are `/shop/p/{slug}` — the
 *  marker is the `p` — while its CATEGORY pages are `/shop/{category}`, which would otherwise
 *  qualify and could send a shopper to a category page in place of the piece they clicked. */
const PRODUCT_SEGMENTS = new Set(["products", "product", "p", "item", "items", "listing"]);

/**
 * A title as these platforms slugify it: lowercase, punctuation dropped, spaces to hyphens.
 *
 * Verified against the real thing rather than assumed — Squarespace's own `urlSlug` for "Dolce &
 * Gabbana Leopard Calf Hair Pointed-Toe Pumps" is "dolce-gabbana-leopard-calf-hair-pointed-toe-pumps",
 * which is exactly this. Shopify's handles are built the same way.
 */
export function slugifyTitle(title: string): string {
 return (title || "")
  .normalize("NFKD").replace(/[̀-ͯ]/g, "") // é → e, so the slug matches the platform's
  .toLowerCase()
  .replace(/['’]/g, "")   // apostrophes vanish rather than becoming separators
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");
}

/**
 * The captured page for a product, chosen from every path this store has.
 *
 * `keys` are the product's candidate identities, most trustworthy first — its source handle, then
 * its slugified title. A page is a candidate when its last segment IS one of those keys and it sits
 * under a product-ish segment, so a top-level page (`/about`) or a collection (`/shop/shoes`) can
 * never be mistaken for one.
 *
 * Ordering matters: keys are tried in the order given, and `/products/…` wins ties, so a store that
 * happens to hold BOTH shapes still resolves to the one the rest of the pipeline expects.
 */
export function pickCapturedProductPath(paths: string[], keys: (string | null | undefined)[]): string | null {
 const wanted = keys.map((k) => (k || "").trim().toLowerCase()).filter(Boolean);
 if (!wanted.length) return null;
 const candidates = paths.filter(isProductPagePath);
 for (const key of wanted) {
  const matches = candidates.filter((p) => lastSegment(p) === key);
  if (!matches.length) continue;
  return matches.find((p) => p.toLowerCase().startsWith("/products/")) || matches[0];
 }
 return null;
}

/** Does this captured path look like a product page (rather than a collection or a content page)? */
export function isProductPagePath(path: string): boolean {
 const segs = (path || "").toLowerCase().split("/").filter(Boolean);
 if (segs.length < 2) return false;
 // Some segment BEFORE the last has to say "product" in one of these platforms' vocabularies.
 return segs.slice(0, -1).some((s) => PRODUCT_SEGMENTS.has(s));
}

/**
 * Does this captured page actually show the product we went looking for?
 *
 * The check that makes a slugified-title guess safe. Compared on the page's own heading, loosely
 * (case, punctuation and whitespace differ between a feed's title and its rendered heading) but
 * never leniently enough for a different garment to pass: one title has to CONTAIN the other, which
 * a sibling listing ("… – Pink Suede") won't do against the plain one in the wrong direction, since
 * the page's heading is what has to be at least as specific as the item's name.
 */
export function pageNamesProduct(html: string, title: string): boolean {
 const want = normalizeName(title);
 if (!want) return false;
 for (const heading of headings(html)) {
  const got = normalizeName(heading);
  if (!got) continue;
  if (got === want || got.includes(want) || want.includes(got)) return true;
 }
 return false;
}

/** The page's <h1>s, read off the raw HTML — these documents run to megabytes and are not worth a
 *  full parse for one string. */
function headings(html: string): string[] {
 return [...(html || "").matchAll(/<h1[^>]*>([\s\S]{0,400}?)<\/h1>/gi)]
  .map((m) => m[1].replace(/<[^>]*>/g, " "));
}

function normalizeName(s: string): string {
 return (s || "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function lastSegment(path: string): string {
 const segs = (path || "").toLowerCase().split("/").filter(Boolean);
 return segs[segs.length - 1] || "";
}
