// Store health: turn the two gate reports (parity + blackout) into tiered findings a seller can read.
//
// There is deliberately no score. A wrong price and a lost background photo are not "both 4%"; one
// means the store cannot sell correctly and the other means it looks a little worse. So findings
// carry a tier, and the verdict is simply the worst tier present:
//   blocking  → fail   (missing/extra products, wrong prices, page dead, no way to reach items)
//   degrading → warn   (photos/video/logo lost, a collection off, a page not captured)
//   cosmetic  → pass   (order, nav, count labels — noted, never gating)
// Messages are written for the seller: no "blackout", "Shopify", "cdn" or "parity" in them.

export type Tier = "blocking" | "degrading" | "cosmetic";
export type Finding = { tier: Tier; page?: string; message: string };
export type Verdict = "pass" | "warn" | "fail" | "unknown";

export type ParityReport = {
 catalog: {
  sourceProducts: number; ourItems: number; missingHere: number; extraHere: number; availabilityMismatch: number;
  /** In stock and priced on her site, but she has no photo of it — nobody can render a card. */
  missingNoPhoto?: number;
  /** Sold, or not for sale. Left out on purpose; never a fault. */
  soldOrUnlisted?: number;
  platform?: string;
  productParityPct: number | null; collections: number; collectionsExact: number; collectionsMissingHere: string[]; collectionsOff: string[];
  /** Collections we could not read from the seller's site — excluded from the comparison above. */
  collectionsUnread?: string[];
  /** Collections whose served page disagrees with our own filing — our bug, not the seller's. */
  collectionsInflated?: string[];
  /** Product pages sampled, and those advertising a price the cart would not charge. */
  priceChecked?: number; priceStale?: string[]; priceUnstated?: number;
 };
 pages: { sitemap: number; captured: number; missingHere: number; pageParityPct: number | null };
 shopper: Record<string, { error?: string; titlesPresent?: string; titlesInOrder?: string; pricesPresent?: string; navPresent?: string; headingsPresent?: string; missingTitles?: string[]; missingPrices?: string[] }>;
};
type PageMetrics = { imgsLoaded: number; productLinks: number; headerVisible: boolean; logoLoaded: boolean; videosPlaying: number; bgImagesShopify: number; text: number };
export type BlackoutReport = { pages: Record<string, { normal: PageMetrics | { error: string }; blackout: PageMetrics | { error: string } }> };

const RANK: Record<Tier, number> = { cosmetic: 0, degrading: 1, blocking: 2 };
const VERDICT: Record<Tier, Verdict> = { cosmetic: "pass", degrading: "warn", blocking: "fail" };

/** "9/12" → 3 short. Malformed or absent → 0 (never invent a problem from a missing number). */
function shortfall(ratio: string | undefined): number {
 const m = /^(\d+)\/(\d+)$/.exec(ratio ?? "");
 return m ? Math.max(0, Number(m[2]) - Number(m[1])) : 0;
}
const n = (count: number, one: string, many = one + "s") => `${count} ${count === 1 ? one : many}`;
const isErr = (m: PageMetrics | { error: string } | undefined): m is { error: string } | undefined => !m || "error" in m;

export function gradeStore(input: { parity: ParityReport | null; blackout: BlackoutReport | null }): { verdict: Verdict; findings: Finding[] } {
 const { parity, blackout } = input;
 if (!parity && !blackout) return { verdict: "unknown", findings: [{ tier: "degrading", message: "This store has not been checked yet." }] };
 const f: Finding[] = [];
 const add = (tier: Tier, message: string, page?: string) => f.push(page ? { tier, page, message } : { tier, message });

 if (parity) {
  const c = parity.catalog;
  // The catalogue, price, collection and sold-status checks all read Shopify's public feeds, so on
  // any other platform they produce nothing at all — and a store with no findings reads as passing.
  // That is how vintage-boutique-style became the fleet's only PASS: nothing looked at it. Three of
  // twenty-three stores are in this state (two Squarespace, one unrecognised). Say so instead.
  if (c.platform && c.platform !== "shopify") {
   add("degrading", "We couldn’t check your product list, prices or collections against your site.");
  }
  if (c.missingHere > 0) add("blocking", `${n(c.missingHere, "product")} on your site ${c.missingHere === 1 ? "is" : "are"} missing here.`);
  // Her photo, not our import. Every one of these is in stock and priced on her own site with no
  // image attached, so no shop — hers or ours — can show it. Told plainly, and never blocking.
  if ((c.missingNoPhoto ?? 0) > 0) {
   const k = c.missingNoPhoto as number;
   add("degrading", `${n(k, "product")} on your site ${k === 1 ? "has" : "have"} no photo, so ${k === 1 ? "it cannot" : "they cannot"} be shown here. Adding ${k === 1 ? "an image" : "images"} on your own site fixes ${k === 1 ? "it" : "them"}.`);
  }
  if (c.extraHere > 0) add("blocking", `${n(c.extraHere, "product")} here ${c.extraHere === 1 ? "is" : "are"} no longer on your site.`);
  if (c.availabilityMismatch > 0) add("blocking", `${n(c.availabilityMismatch, "product")} show${c.availabilityMismatch === 1 ? "s" : ""} the wrong sold-out status.`);
  for (const [page, s] of Object.entries(parity.shopper ?? {})) {
   if (s.error) { add("blocking", "This page did not load.", page); continue; }
   const titles = shortfall(s.titlesPresent);
   if (/^0\/0$/.test(s.titlesPresent ?? "")) { add("degrading", "We couldn’t compare the products on this page.", page); continue; }
   if (page.startsWith("/products/")) {
    // A product page lists one product; every other product link on it is the platform's
    // "you may also like" strip, which the hosted copy does not mirror. Not a missing product.
    if (titles) add("cosmetic", "The “you may also like” picks differ from your site.", page);
    continue;
   }
   // A price can only be "wrong" for a product that is shown here; prices absent because the
   // product is absent (a recommendations strip we do not mirror) are the titles finding below.
   const prices = Math.max(0, shortfall(s.pricesPresent) - titles);
   if (prices) add("blocking", `${n(prices, "price")} differ${prices === 1 ? "s" : ""} from your site${s.missingPrices?.length ? ` (${s.missingPrices.slice(0, 4).join(", ")})` : ""}.`, page);
   if (titles) add("degrading", `${n(titles, "product")} shown on your site ${titles === 1 ? "is" : "are"} not shown here.`, page);
   const headings = shortfall(s.headingsPresent);
   if (headings) add("degrading", `${n(headings, "section heading")} missing.`, page);
   const order = shortfall(s.titlesInOrder);
   if (order) add("cosmetic", `${n(order, "product")} appear${order === 1 ? "s" : ""} in a different order than on your site.`, page);
   const nav = shortfall(s.navPresent);
   if (nav) add("cosmetic", `${n(nav, "menu link")} differ${nav === 1 ? "s" : ""} from your site.`, page);
  }
  // Showing one price and charging another is the worst thing a hosted store can do, so it outranks
  // every difference with the seller's own site.
  if (c.priceStale?.length) {
   add("blocking", `${n(c.priceStale.length, "product page")} show${c.priceStale.length === 1 ? "s" : ""} a price that isn’t what a shopper would be charged.`);
  }
  if (c.priceUnstated) add("degrading", `We couldn’t check the price shown on ${n(c.priceUnstated, "product page")}.`);
  // Our own page disagreeing with our own records is worse than any difference with their site:
  // the shopper is looking at stock the seller never put there. Named, so they can go and check.
  if (c.collectionsInflated?.length) {
   const names = c.collectionsInflated.map((s) => s.split(" ")[0]);
   add("blocking", `${n(names.length, "collection")} ${names.length === 1 ? "is showing pieces you" : "are showing pieces you"} didn’t put in ${names.length === 1 ? "it" : "them"} (${names.slice(0, 3).join(", ")}).`);
  }
  const off = c.collections - c.collectionsExact;
  if (off > 0) add("degrading", `${n(off, "collection")} ${off === 1 ? "has" : "have"} a different number of products than on your site${c.collectionsOff?.length ? ` (${c.collectionsOff.slice(0, 3).join(", ")})` : ""}.`);
  if (c.collectionsMissingHere?.length) add("degrading", `${n(c.collectionsMissingHere.length, "collection")} from your site ${c.collectionsMissingHere.length === 1 ? "is" : "are"} missing here: ${c.collectionsMissingHere.slice(0, 4).join(", ")}.`);
  if (parity.pages?.missingHere > 0) add("degrading", `${n(parity.pages.missingHere, "page")} from your site ${parity.pages.missingHere === 1 ? "was" : "were"} not copied.`);
 }

 if (blackout) {
  for (const [page, { normal, blackout: b }] of Object.entries(blackout.pages ?? {})) {
   if (isErr(normal) || isErr(b)) { add("blocking", "This page did not load.", page); continue; }
   // Losing EVERY product on a page is the failure this exists for. Losing some is not the same
   // thing: thenicheshop renders 40 tiles normally and 35 with the platform cut off, 14 of them
   // different, because a filter app injects extras — and every piece that drops out is active and
   // sits in four to six other collections. Nothing stops working; the page lists a different
   // selection. Reporting that as broken links was false, and it was the store's only blocker.
   if (normal.productLinks > 0 && b.productLinks === 0) {
    add("blocking", "No products could be reached from this page if you left your current platform.", page);
   } else if (normal.productLinks > 0 && b.productLinks < normal.productLinks) {
    add("degrading", `${n(normal.productLinks - b.productLinks, "fewer product")} would be listed on this page if you left your current platform.`, page);
   }
   if (normal.headerVisible && !b.headerVisible) add("blocking", "The header and menu would disappear if you left your current platform.", page);
   if (b.imgsLoaded < normal.imgsLoaded) add("degrading", `${n(normal.imgsLoaded - b.imgsLoaded, "photo")} would stop loading if you left your current platform.`, page);
   if (normal.videosPlaying > 0 && b.videosPlaying < normal.videosPlaying) add("degrading", "A video would stop playing if you left your current platform.", page);
   if (b.bgImagesShopify > 0) add("degrading", `${n(b.bgImagesShopify, "background image")} would stop loading if you left your current platform.`, page);
   if (normal.logoLoaded && !b.logoLoaded) add("degrading", "Your logo would stop loading if you left your current platform.", page);
  }
 }

 f.sort((a, b) => RANK[b.tier] - RANK[a.tier]);
 const verdict: Verdict = f.length ? VERDICT[f[0].tier] : "pass";
 return { verdict, findings: f };
}

/**
 * The *kind* of a finding, for the census: the same problem on two stores must group together, so
 * counts become N, quoted examples drop, and singular/plural collapse. Page identity is kept only as
 * its type (home / collection / product) — "photos lost on the home page" is a different problem
 * from "photos lost on a product page" (chrome strip vs. gallery), and both are engine problems.
 */
export function findingKind(f: Finding): string {
 const msg = f.message
  .replace(/\s*\([^)]*\)/g, "")
  .replace(/\d[\d,]*/g, "N")
  .replace(/\bN (price|product|collection|page|photo|menu link|section heading|background image|product link)s?\b/g, "N $1s")
  .replace(/\b(differs|appears|shows|is|was|has)\b/g, (w) => ({ differs: "differ", appears: "appear", shows: "show", is: "are", was: "were", has: "have" })[w] ?? w);
 const where = !f.page ? "" : f.page === "/" ? " [home]" : f.page.startsWith("/collections/") ? " [collection]" : f.page.startsWith("/products/") ? " [product]" : " [page]";
 return `${f.tier} · ${msg}${where}`;
}
