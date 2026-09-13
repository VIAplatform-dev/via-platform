// Some Shopify facets file through an opaque id instead of a plain label:
//   filter.p.m.custom.brand=gid://shopify/Metaobject/441893388388   (a brand chosen from a linked list)
//   filter.v.t.shopify.size=gid://shopify/TaxonomyValue/2885        (Shopify's Standard Product Taxonomy)
// applyFacets (facets.ts) matches a filter's value against a plain item field ("Balenciaga", "2"),
// so an id sailing straight through matched nothing — every checkbox on Venus Vintage's theme filed
// this way, so ticking any of them changed nothing and the seller (and every other rental/taxonomy
// theme like it) read that as "the filters are broken."
//
// The theme already carries the answer on the very checkbox the shopper ticked: Shopify puts the
// human label in `data-label`, right beside the id it submits, because ITS OWN JS needs the same
// translation to show "Balenciaga" as an active-filter chip. This reads that back off whichever page
// is being served — no separate lookup, no Admin API, nothing that needs a token.
//
// Pure — no I/O — so applyFacets, and any other caller, can build the map once per request from the
// same html and use it for every filter key.

const INPUT_TAG = /<input\b[^>]*>/g;
const NAME_ATTR = /\bname="filter\.[^"]*"/;
const VALUE_ATTR = /\bvalue="([^"]*)"/;
const LABEL_ATTR = /\bdata-label="([^"]*)"/;

/** Just enough entity decoding for a label a seller typed into Shopify — quotes, ampersands, angle
 *  brackets. Not a general HTML decoder; filter labels are short plain text, never markup. */
function decodeEntities(s: string): string {
 return s
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&");
}

/** id (the filter's `value`) → label (`data-label`), read from every `<input name="filter.…">` on
 *  the page. A checkbox with no `data-label` — the classic case, where `value` already IS the label
 *  ("filter.p.vendor=Chanel") — contributes nothing; there is nothing to resolve. */
export function extractFacetLabels(html: string): Map<string, string> {
 const map = new Map<string, string>();
 for (const m of html.matchAll(INPUT_TAG)) {
  const tag = m[0];
  if (!NAME_ATTR.test(tag)) continue;
  const value = VALUE_ATTR.exec(tag)?.[1];
  const label = LABEL_ATTR.exec(tag)?.[1];
  if (value && label) map.set(value, decodeEntities(label));
 }
 return map;
}

/** A filter value as a shopper would recognise it: its label, when the page told us one, otherwise
 *  the value unchanged (the classic case, and the safe fallback for an id the map doesn't cover —
 *  matching the raw id against a plain field correctly matches nothing, rather than guessing). */
export function resolveFacetValue(value: string, labels: Map<string, string>): string {
 return labels.get(value) ?? value;
}
