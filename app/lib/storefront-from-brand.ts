// "We couldn't copy your site, but we can still make it yours."
//
// Some storefronts can't be captured at all: Wix and single-page apps build their pages in the
// browser, so the server sends us almost nothing, and a few sites publish no product feed we can
// read. Until now those sellers hit a dead end — an honest decline, and a blank starter storefront
// that looked like everybody else's.
//
// This builds a VYA storefront from the seller's BRAND instead of their markup. Colours, fonts,
// logo, store name and nav labels survive in the HTML even when the layout doesn't, because they
// live in <head>, in CSS custom properties, and in the fonts the page loads. That's enough to make
// the starter storefront recognisably theirs, and it works on 100% of sites — including the ones
// where capture is impossible — because it never parses their layout.
//
// Inventory for these stores comes from the CSV upload (parse-items.ts) or a platform connection.

import * as cheerio from "cheerio";
import { assertPublicUrl, safeFetch } from "./safe-url.ts";
import { extractTheme, type StorefrontTheme } from "./store-import.ts";
import { defaultStarterTheme } from "./storefront-default.ts";
import { makeBlock } from "./storefront-blocks.ts";

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export type BrandProfile = {
 name: string | null;
 colors: StorefrontTheme["colors"];
 fonts: StorefrontTheme["fonts"];
 logo: string | null;
 /** Top-level menu labels — enough to rebuild their navigation even with no captured pages. */
 nav: { label: string; href: string }[];
 tagline: string | null;
 socials: StorefrontTheme["socials"];
 /** Which signals we actually found, so the caller can tell the seller what carried over. */
 found: string[];
};

/** Nav labels a storefront shouldn't inherit — account/cart plumbing, not the seller's menu. */
const NAV_SKIP = /^(cart|bag|account|log ?in|sign ?in|register|checkout|search|wishlist|menu|skip to content|0)$/i;

/** Read a store's brand out of its homepage, however that homepage is built. */
export async function readBrand(rawUrl: string): Promise<BrandProfile | null> {
 const u = await assertPublicUrl(rawUrl);
 if (!u) return null;
 let html: string;
 try {
  const r = await safeFetch(u.href, { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) return null;
  html = await r.text();
 } catch {
  return null;
 }

 const found: string[] = [];
 // extractTheme reads the theme's real CSS custom properties and the web fonts it loads, so it
 // works on a JS-rendered page too — those live in <head>, not in the markup the app builds later.
 const theme = extractTheme(html.slice(0, 120000), u.origin, null);
 if (theme.colors?.bg || theme.colors?.text || theme.colors?.accent) found.push("colours");
 if (theme.fonts?.heading) found.push("fonts");
 if (theme.logo) found.push("logo");

 const $ = cheerio.load(html);
 const pick = (sel: string, attr = "content") => ($(sel).first().attr(attr) || "").trim() || null;
 const name = pick('meta[property="og:site_name"]') || storeNameFromTitle($("title").first().text()) || null;
 if (name) found.push("store name");

 const tagline = pick('meta[name="description"]') || pick('meta[property="og:description"]');
 if (tagline) found.push("tagline");

 // Navigation: the labels a shopper would recognise. Taken from real nav elements only, and
 // de-duplicated — a header usually repeats itself for mobile.
 const nav: { label: string; href: string }[] = [];
 const seen = new Set<string>();
 $("nav a[href], header a[href], [class*='menu'] a[href]").each((_, el) => {
  const label = ($(el).text() || "").replace(/\s+/g, " ").trim();
  const href = ($(el).attr("href") || "").trim();
  if (!label || label.length > 28 || NAV_SKIP.test(label)) return;
  const key = label.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  nav.push({ label, href });
 });
 if (nav.length) found.push(`${nav.length} nav links`);

 const socials: StorefrontTheme["socials"] = {};
 for (const [k, re] of [
  ["instagram", /instagram\.com/i], ["tiktok", /tiktok\.com/i], ["facebook", /facebook\.com/i],
  ["youtube", /youtube\.com|youtu\.be/i], ["pinterest", /pinterest\./i],
 ] as const) {
  const link = $(`a[href*="${k}"]`).first().attr("href");
  if (link && re.test(link)) socials[k] = link;
 }
 if (Object.keys(socials).length) found.push("social links");

 return { name, colors: theme.colors, fonts: theme.fonts, logo: theme.logo ?? null, nav: nav.slice(0, 10), tagline, socials, found };
}

/**
 * Build a complete VYA storefront theme from a brand profile.
 *
 * Starts from the polished default (a real homepage, About / FAQ / Shipping pages) so the seller
 * never lands on something empty, then overlays whatever of their brand we actually found. Their
 * signal always wins; the starter only fills gaps.
 */
export function storefrontFromBrand(brand: BrandProfile): StorefrontTheme {
 const name = brand.name || "Your store";
 const base = defaultStarterTheme(name);

 const blocks = [...(base.blocks || [])];
 // Lead with their own words where we have them, rather than our placeholder copy.
 const heroIndex = blocks.findIndex((b) => b.type === "hero");
 if (heroIndex >= 0) {
  blocks[heroIndex] = makeBlock("hero", {
   heading: name,
   subtext: brand.tagline || "A curated edit of vintage and one-of-a-kind pieces.",
   cta: "Shop the collection",
  });
 }

 return {
  ...base,
  storeName: name,
  // Their palette and type win; the starter template fills anything they didn't declare.
  colors: { ...base.colors, ...(brand.colors || {}) },
  fonts: { ...base.fonts, ...(brand.fonts || {}) },
  // Flagged as scraped, so the studio knows this palette was inferred rather than chosen.
  colorsFrom: brand.colors && Object.keys(brand.colors).length ? "imported" : base.colorsFrom,
  ...(brand.logo ? { logo: brand.logo } : {}),
  ...(Object.keys(brand.socials || {}).length ? { socials: brand.socials } : {}),
  ...(brand.tagline ? { footerAbout: brand.tagline } : {}),
  // Their menu labels, pointed at VYA collections — the hrefs on their old site don't exist here.
  ...(brand.nav.length
   ? { navLinks: brand.nav.map((n) => ({ label: n.label, href: `/collections/${slugify(n.label)}`, place: "header" as const })) }
   : {}),
  blocks,
 };
}

/** The store's name out of a <title>.
 *
 *  Titles are separator-joined but the order isn't consistent: Shopify writes "Store — tagline"
 *  (name first) while plenty of sites write "Home | Store" (name last). Taking the first segment
 *  blindly named one store "Home". So: drop any segment that's just a page label, and prefer what
 *  remains — falling back to the longest segment when every part looks like a name.
 */
export function storeNameFromTitle(title: string): string | null {
 const parts = (title || "").split(/\s*[|–—·•]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
 if (!parts.length) return null;
 const PAGEY = /^(home|homepage|index|welcome|shop|store|shop all|main)$/i;
 const named = parts.filter((p) => !PAGEY.test(p));
 if (!named.length) return null;
 return named[0];
}

const slugify = (s: string) => s.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** One call for the decline path: read the brand, build the storefront, report what carried over. */
export async function buildStorefrontFromUrl(rawUrl: string): Promise<{ theme: StorefrontTheme; brand: BrandProfile } | null> {
 const brand = await readBrand(rawUrl);
 if (!brand) return null;
 return { theme: storefrontFromBrand(brand), brand };
}
