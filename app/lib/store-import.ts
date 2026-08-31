import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { fetchShopifyProductsPublic, parseLooseJson } from "./shopifyClient.ts";
import { readEndedCleanly } from "./feed-completeness.ts";
import { readCollectionMembership, type CollectionPageResult } from "./collection-membership.ts";
import { formatPrice } from "./formatPrice.ts";
import { assertPublicUrl, safeFetch } from "./safe-url.ts";
import { makeBlock, type BlockType } from "./storefront-blocks.ts";
import type { StoreProfile } from "./store-profile.ts";
import { detectPlatform, declineMessage } from "./import-engine/detect.ts";
import { fetchWooProducts, fetchViaJsonLd, BlockedByStoreError } from "./import-engine/rungs.ts";

/** One storefront section as an editable studio block (matches StorefrontTheme.blocks). */
type HomeBlock = { id: string; type: string; props: Record<string, string>; style?: { bg?: string } };

// ───────────────────────────────────────────────────────────────────────────
// Pull a real storefront (Shopify / Squarespace) from a pasted URL — name, brand
// color, and products + images. Shared by the public /infrastructure demo AND
// the real seller onboarding import (which persists the result as a VYA store).
// ───────────────────────────────────────────────────────────────────────────

export type ImportedProduct = {
 name: string;
 /** Display price, pre-formatted for the demo/preview UI. NOT a source of truth for money —
  *  anything that stores or compares a price must use `priceCents` + `currency` (parsing digits
  *  back out of "£120.00" is how imported GBP catalogues ended up labelled USD). */
 price: string;
 priceCents?: number | null;
 /** What it was before the seller marked it down, when a markdown is running. */
 compareAtCents?: number | null;
 currency?: string | null; // ISO code read from the platform, never guessed from a £/€ glyph
 image: string;
 images?: string[];
 description?: string | null;
 size?: string | null;
 available?: boolean; // false = sold out on the source site
 tags?: string[]; // category/collection tags (for the Shop dropdown filter)
 // ── Source identity: what makes re-import a MERGE instead of a duplicate ──
 sourcePlatform?: string | null;
 sourceId?: string | null; // platform's own stable id/handle — survives a rename
 sourceUrl?: string | null;
 variants?: { sourceVariantId?: string | null; size?: string | null; color?: string | null; priceCents?: number | null; available: boolean }[];
 /** Collections this product belongs to, when the source tells us directly (a connected store's
  *  API does; a scraped one needs a separate per-collection crawl to work it out). */
 collectionHandles?: string[];
};

/** A storefront's visual identity + cloned structure, pulled from the source site. */
export type StorefrontTheme = {
 fonts?: { heading?: string; body?: string };
 colors?: { bg?: string; text?: string; accent?: string };
 // Where `colors` came from, because it changes how much we should trust the accent. "studio" = a
 // human picked this palette, so the live page must render it exactly. "imported" = we scraped it
 // out of their old site's CSS, where the "accent" is often a spurious colour (a sale-tag red, a
 // link blue) and the ink is the safer match. Absent = treated as studio.
 colorsFrom?: "studio" | "imported";
 radius?: "sharp" | "soft" | "round"; // global corner style ("shapes") — rounds product cards, images, buttons
 skin?: "gallery" | "editorial" | "boutique" | "archive" | "statement"; // global style skin — type scale, spacing, and button shape across every section (storefront-skins.ts)
 // The palette + type the store had BEFORE its first skin was applied, so clearing the skin can put
 // the store back rather than stranding it on the last skin's colours. Written when a skin is first
 // applied, cleared when the skin is removed.
 preSkin?: { colors?: { bg?: string; text?: string; accent?: string }; fonts?: { heading?: string; body?: string } };
 customCss?: string; // raw custom CSS layered over the storefront — AI- or hand-written; targets .vya-* classes
 template?: string; // chosen starter template id (storefront-templates.ts) — drives hero style
 blocks?: { id: string; type: string; props: Record<string, string>; style?: { bg?: string } }[]; // section-based home page (storefront-blocks.ts)
 shopBlocks?: { id: string; type: string; props: Record<string, string>; style?: { bg?: string } }[]; // editable intro content shown ABOVE the product grid on the Shop page
 extraPages?: { slug: string; title: string; blocks: { id: string; type: string; props: Record<string, string>; style?: { bg?: string } }[] }[]; // additional block-based pages
 logo?: string | null;
 headerLayout?: "inline" | "center" | "split" | "stacked"; // where the brand and menu sit (app/s/StoreChrome.tsx)
 // Footer: the store's social links + a short about blurb, shown site-wide in the footer.
 socials?: { instagram?: string; tiktok?: string; facebook?: string; youtube?: string; pinterest?: string; email?: string };
 footerAbout?: string;
 // Custom links the seller adds to the header and/or footer nav (beyond the auto page/collection links).
 navLinks?: { label: string; href: string; place?: "header" | "footer" | "both" }[];
 // cloned design (from site-clone): the original's name, nav, hero, and pages.
 storeName?: string | null;
 nav?: string[];
 hero?: { headline?: string | null; subheadline?: string | null; ctaLabel?: string | null; layout?: string };
 vibe?: string | null;
 header?: { announcement: string | null; hasSearch: boolean; hasCart: boolean; hasAccount: boolean };
 sections?: {
 type: string;
 headline: string | null;
 subheadline: string | null;
 text: string | null;
 ctas: { label: string; style: string }[];
 layout: string;
 align: string;
 background: string;
 image: string | null;
 }[];
 categories?: { label: string; slug: string }[];
 pages?: { slug: string; label: string; title: string | null; blocks: { type: string; value: string }[]; pageType?: string }[];
 // store understanding — voice, pricing, typical inventory (see store-profile.ts).
 profile?: StoreProfile;
};

export type ImportResult = {
 ok: boolean;
 storeName: string;
 platform: "shopify" | "squarespace" | "unknown";
 brandColor: string | null;
 hero: string | null;
 theme: StorefrontTheme | null;
 products: ImportedProduct[];
 blocks?: HomeBlock[]; // section-by-section replica of the source homepage, for the visual studio
 error?: string;
 /**
  * Did this read reach the END of the seller's catalogue? Only a complete read may license the
  * import's sold-sweep. Absent means unknown, which refuses the sweep — see feed-completeness.ts.
  */
 feedComplete?: boolean;
 /**
  * Every source id the feed listed, including pieces that never became items (no photo, filtered
  * out). The sold-sweep must treat these as SEEN: they are on the seller's site, just not importable.
  */
 feedSourceIds?: string[];
};

// SSRF guard lives in ./safe-url so the site-capture crawler shares the exact same allow-list.

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
 return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

// One User-Agent for every outbound import fetch, matching site-capture and import-engine/rungs.
// A "VYA-Importer/1.0" UA is 403'd by common WordPress/Cloudflare bot rules, and a blocked response
// looks like an empty page — which made a perfectly importable WooCommerce store get detected as a
// client-rendered shell and declined. Identify the same way the capture crawler does.
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const titleCase = (s: string) => s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

// ── Design extraction ───────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] | null {
 const m = hex.replace("#", "");
 if (m.length !== 6) return null;
 const n = parseInt(m, 16);
 if (Number.isNaN(n)) return null;
 return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex: string): number {
 const rgb = hexToRgb(hex);
 if (!rgb) return 0;
 const [r, g, b] = rgb.map((v) => v / 255);
 return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function saturation(hex: string): number {
 const rgb = hexToRgb(hex);
 if (!rgb) return 0;
 const [r, g, b] = rgb.map((v) => v / 255);
 const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
 return mx === 0 ? 0 : (mx - mn) / mx;
}
function absolutize(src: string, origin: string): string {
 if (/^https?:\/\//i.test(src)) return src;
 if (src.startsWith("//")) return "https:" + src;
 if (src.startsWith("/")) return origin + src;
 return origin + "/" + src;
}

/** Pull the EXACT fonts, colours, and logo out of the homepage HTML/CSS — reading
 * the real CSS custom properties + Google Fonts the theme declares, not guessing. */
export function extractTheme(head: string, origin: string, themeColor: string | null): StorefrontTheme {
 const isRealFont = (f: string) => Boolean(f) && f.length > 1 && f.length < 40 && !/^(inherit|sans-serif|serif|monospace|system-ui|ui-|-apple|blinkmac|segoe|roboto|arial|helvetica|times|var\(|initial|unset|none|swap|auto)/i.test(f);
 const firstFont = (decl?: string) => { if (!decl) return null; const f = decl.split(",")[0].replace(/["']/g, "").trim(); return isRealFont(f) ? f : null; };

 // The actual web fonts the page loads (most reliable signal for spelling).
 const gf: string[] = [];
 for (const m of head.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'>]+)/gi)) {
 for (const f of m[1].matchAll(/family=([^&:"']+)/gi)) {
 const name = decodeURIComponent(f[1].replace(/\+/g, " ")).replace(/:[0-9,;@a-z. ]+$/i, "").trim();
 if (name) gf.push(name);
 }
 }
 const canon = (f: string | null) => (f ? gf.find((g) => g.toLowerCase() === f.toLowerCase()) || f : null);

 // Heading + body: theme's CSS variables win, then h1/body rules, then loaded fonts.
 const headVar = head.match(/--font-(?:heading|header|h[1-6]|title)[\w-]*family\s*:\s*([^;}"']+)/i);
 const bodyVar = head.match(/--font-(?:body|text|paragraph|base)[\w-]*family\s*:\s*([^;}"']+)/i);
 const headRule = head.match(/(?:h1|\.h1|\.heading)[^{}]*\{[^{}]*font-family\s*:\s*([^;}"']+)/i);
 const bodyRule = head.match(/(?:^|[},])\s*body[^{}]*\{[^{}]*font-family\s*:\s*([^;}"']+)/i);
 let heading = canon(firstFont(headVar?.[1]) || firstFont(headRule?.[1]));
 let body = canon(firstFont(bodyVar?.[1]) || firstFont(bodyRule?.[1]));
 if (!heading) heading = gf[0] || null;
 if (!body) body = gf.find((g) => g.toLowerCase() !== (heading || "").toLowerCase()) || gf[0] || heading;
 const fonts = heading || body ? { heading: (heading || body)!, body: (body || heading)! } : undefined;

 // Colours — exact CSS custom properties first (#hex OR "r, g, b" triplets).
 const toHex = (v: string): string | null => {
 const hx = v.match(/#([0-9a-fA-F]{6})\b/); if (hx) return "#" + hx[1].toLowerCase();
 const rgb = v.match(/(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/); if (rgb) return "#" + [rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, +n).toString(16).padStart(2, "0")).join("");
 return null;
 };
 const cvars: [string, string][] = [];
 for (const m of head.matchAll(/--([\w-]*colou?r[\w-]*)\s*:\s*([^;}]+)/gi)) {
 const hex = toHex(m[2]); if (hex) cvars.push([m[1].toLowerCase(), hex]);
 }
 const pick = (re: RegExp, not: RegExp) => { for (const [n, hex] of cvars) if (re.test(n) && !not.test(n)) return hex; return undefined; };
 let bg = pick(/background|(^|-)bg($|-)|base-background|scheme-1|body-bg/, /text|foreground|button|accent|border|shadow|overlay/);
 let text = pick(/foreground|(^|-)text($|-)|base-text|body-text/, /background|(^|-)bg($|-)|button|accent|placeholder|border/);
 let accent = pick(/accent|primary|brand|link|button(?!-label|-text)/, /background|(^|-)bg($|-)|foreground|text|border|disabled/);

 // Sanity: a real page background is light; body text is dark + fairly neutral.
 // (Rejects sale-red / brand-plum utility vars masquerading as bg/text.)
 if (bg && luminance(bg) < 0.6) bg = undefined;
 if (text && (luminance(text) > 0.5 || saturation(text) > 0.55)) text = undefined;

 // Fallback: theme-color + hex frequency for anything the variables didn't give.
 if (!bg || !text || !accent) {
 const freq = new Map<string, number>();
 for (const m of head.matchAll(/#([0-9a-fA-F]{6})\b/g)) { const h = "#" + m[1].toLowerCase(); freq.set(h, (freq.get(h) || 0) + 1); }
 const common = [...freq.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
 if (!bg) bg = common.find((h) => luminance(h) > 0.82 && saturation(h) < 0.25);
 if (!text) text = common.find((h) => luminance(h) < 0.25 && saturation(h) < 0.45);
 if (!accent) accent = (themeColor && /^#[0-9a-fA-F]{6}$/.test(themeColor) ? themeColor.toLowerCase() : undefined) || common.find((h) => saturation(h) > 0.3 && luminance(h) > 0.12 && luminance(h) < 0.8);
 }
 const colors: StorefrontTheme["colors"] = {};
 if (bg) colors.bg = bg;
 if (text) colors.text = text;
 if (accent) colors.accent = accent;

 // Logo — an <img> that smells like a logo.
 let logo: string | null = null;
 const logoM = head.match(/<img[^>]*\b(?:class|id|alt|src)=["'][^"']*logo[^"']*["'][^>]*>/i);
 if (logoM) { const s = logoM[0].match(/\bsrc=["']([^"']+)["']/i); if (s) logo = absolutize(s[1], origin); }

 // Flagged as scraped: these colours are a best guess off someone else's CSS, not a chosen palette.
 return { fonts, colors: Object.keys(colors).length ? colors : undefined, colorsFrom: "imported", logo };
}

/** Pull store name / brand color / platform hints from the homepage <head>. */
/** Parse a homepage's real sections into editable studio blocks — an approximate
 *  section-by-section replica the seller can then refine, instead of a generic
 *  template. Best-effort: we classify each top-level section by what it CONTAINS
 *  (hero / product grid / split / text / image / newsletter) rather than trying to
 *  reproduce exact CSS. Platform-aware anchors: Shopify `#shopify-section-*`,
 *  Squarespace `.page-section`/`[data-section-id]`, then generic `<section>`. */
export function extractHomeBlocks(html: string, origin: string): HomeBlock[] {
 let $: cheerio.CheerioAPI;
 try { $ = cheerio.load(html); } catch { return []; }

 const abs = (src?: string): string => {
  let s = (src || "").trim();
  if (!s) return "";
  if (s.startsWith("//")) s = "https:" + s;
  try { return new URL(s, origin).href; } catch { return /^https?:/i.test(s) ? s : ""; }
 };
 const clean = (t?: string | null): string => (t || "").replace(/\s+/g, " ").trim();

 // Best image URL from an <img> — prefer the largest srcset candidate, skip data: URIs.
 const bestImg = (el: Element): string => {
  const $el = $(el);
  const ss = $el.attr("srcset") || $el.attr("data-srcset") || "";
  if (ss) {
   const cands = ss.split(",").map((c) => c.trim().split(/\s+/)[0]).filter(Boolean);
   if (cands.length && !/^data:/i.test(cands[cands.length - 1])) return abs(cands[cands.length - 1]);
  }
  const src = $el.attr("src") || $el.attr("data-src") || $el.attr("data-original") || "";
  return src && !/^data:/i.test(src) ? abs(src) : "";
 };

 const blocks: HomeBlock[] = [];
 const push = (type: BlockType, props: Record<string, string>) => { blocks.push(makeBlock(type, props)); };

 // Announcement bar (Shopify/Squarespace common patterns), from the very top.
 const ann = clean($("[class*='announcement'], [class*='promo-bar'], [class*='topbar']").first().text());
 if (ann && ann.length <= 120) push("announcement", { text: ann });

 // Candidate top-level sections, platform-aware, narrowing to the most specific match.
 let secs = $("[id^='shopify-section']").toArray();
 if (!secs.length) secs = $("section[data-section-id], .page-section").toArray();
 if (!secs.length) secs = $("main section, body > section").toArray();
 if (!secs.length) secs = $("section").toArray();
 const secSet = new Set(secs);

 const SKIP = /header|footer|nav|menu|cart|drawer|announcement|cookie|popup|modal|newsletter-popup|breadcrumb/i;
 let heroDone = false;

 for (const el of secs) {
  if (blocks.length >= 11) break;
  const $s = $(el);
  const cls = (($s.attr("class") || "") + " " + ($s.attr("id") || "")).toLowerCase();
  if (SKIP.test(cls)) continue;
  // Skip a wrapper that merely contains other candidate sections — keep the leaf sections.
  if ($s.find("*").toArray().some((d) => secSet.has(d))) continue;

  const heading = clean($s.find("h1, h2, h3").first().text()).slice(0, 120);
  const paras = $s.find("p").map((_, p) => clean($(p).text())).get().filter((t) => t.length > 2);
  const body = paras.slice(0, 2).join("\n\n");
  const productLinks = $s.find("a[href*='/products/'], a[href*='/product/'], a[href*='/shop/']").length;
  const isNewsletter = $s.find("input[type='email']").length > 0 || /subscribe|newsletter|sign\s*up|join the/i.test(cls);

  let image = "";
  $s.find("img").each((_, im) => { if (!image) image = bestImg(im); });
  if (!image) {
   $s.find("[style*='background-image']").each((_, b) => {
    if (image) return;
    const m = /background-image\s*:\s*url\((['"]?)(.*?)\1\)/i.exec($(b).attr("style") || "");
    if (m && m[2] && !/^data:/i.test(m[2])) image = abs(m[2]);
   });
  }
  const cta = clean($s.find("a.button, a.btn, a[class*='button'], a[class*='btn'], a[role='button']").first().text()).slice(0, 24);

  // Classify — order matters (most specific signal wins).
  if (isNewsletter) { push("newsletter", { heading: heading || "Join the list", subtext: paras[0] || "" }); continue; }
  if (productLinks >= 2) { push("featured", { heading: heading || "Shop" }); continue; }
  if (!heroDone && image && heading) { push("hero", { heading, subtext: paras[0] || "", cta: cta || "", image }); heroDone = true; continue; }
  if (image && (heading || body)) { push("split", { heading: heading || "", body, cta: cta || "", image, imageSide: blocks.length % 2 ? "right" : "left" }); continue; }
  if (image) { push("image", { image, caption: heading || "" }); continue; }
  if (heading && paras.length) { push("text", { heading, body }); continue; }
  if (heading) { push("statement", { quote: heading, attribution: "" }); continue; }

  // ── Lossless fallback ──────────────────────────────────────────────────────────────────
  // Anything the rules above can't name used to fall off the end of this loop and vanish, so a
  // section the seller had built — a size guide, an authentication promise, a press strip — was
  // simply missing from the imported storefront with nothing to say so. Keep it verbatim as a
  // `custom` block instead: it renders as its own markup (sanitized on save, inheriting the
  // store's colours and type), and the seller can edit, reorder or delete it like any other
  // section. Classification failure is now a fidelity choice, not data loss.
  const verbatim = verbatimHtml($, el);
  if (verbatim) push("custom", { html: verbatim, mode: "inline" });
 }

 // Always give the seller their catalog: ensure a product grid is present.
 if (!blocks.some((b) => b.type === "featured")) push("featured", { heading: "Shop" });
 return blocks;
}

/** How much source markup one kept-verbatim section may contribute. Generous enough for a real
 *  section, small enough that a runaway page can't bloat the stored theme. */
const VERBATIM_MAX_CHARS = 20000;

/** A section's own markup, stripped of anything that can't survive re-hosting.
 *
 *  Scripts and inline handlers go (the same rule the capture applies — we never execute a third
 *  party's JS on our origin), as do form actions that would POST back to the old platform. What's
 *  left is inert, styled markup. Returns "" when there's nothing meaningful to keep. */
function verbatimHtml($: cheerio.CheerioAPI, el: Element): string {
 const $clone = $(el).clone();
 $clone.find("script, noscript, iframe, object, embed, link[rel='stylesheet']").remove();
 $clone.find("*").each((_, node) => {
  const attribs = (node as Element).attribs || {};
  for (const name of Object.keys(attribs)) {
   if (/^on/i.test(name)) $(node).removeAttr(name); // inline event handlers
   if ((name === "href" || name === "src") && /^\s*javascript:/i.test(attribs[name] || "")) $(node).removeAttr(name);
  }
 });
 // A form pointing at the source platform would silently fail (or worse, leave the store).
 $clone.find("form").each((_, f) => { $(f).removeAttr("action").attr("data-vya-inert", "1"); });
 const html = ($clone.html() || "").trim();
 // Ignore sections that are only whitespace/markup with no substance.
 if (!html || ($clone.text() || "").replace(/\s+/g, " ").trim().length < 2) return "";
 return html.length > VERBATIM_MAX_CHARS ? html.slice(0, VERBATIM_MAX_CHARS) : html;
}

/** The shop's OWN currency, read from the storefront rather than assumed.
 *  Shopify's public products.json carries bare price strings with no currency, so importing a UK
 *  store used to label its GBP prices as USD. The shop states it in `Shopify.currency` (and most
 *  platforms in an og/meta/JSON-LD field); everything else is a guess and we'd rather have none. */
/** The shop's home country — Shopify's `countryCode` in the shop object, present whatever market
 *  the page was served in. It is what lets the feed be requested in the seller's OWN currency. */
function readHomeCountry(html: string): string | null {
 return html.match(/"countryCode"\s*:\s*"([A-Z]{2})"/)?.[1] || html.match(/Shopify\.country\s*=\s*"([A-Z]{2})"/)?.[1] || null;
}

function readCurrency(html: string): string | null {
 const pats = [
  /Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([A-Z]{3})"/,
  /"currencyCode"\s*:\s*"([A-Z]{3})"/,
  /"priceCurrency"\s*:\s*"([A-Z]{3})"/,
  /itemprop=["']priceCurrency["'][^>]*content=["']([A-Z]{3})["']/i,
  /property=["']og:price:currency["'][^>]*content=["']([A-Z]{3})["']/i,
 ];
 for (const re of pats) { const m = html.match(re); if (m) return m[1].toUpperCase(); }
 return null;
}

async function readHomepage(origin: string) {
 const empty = { name: null as string | null, color: null as string | null, hero: null as string | null, theme: null as StorefrontTheme | null, platformHint: "unknown" as string, blocks: [] as HomeBlock[], currency: null as string | null, country: null as string | null, html: "" };
 try {
 const res = await safeFetch(origin, {
 headers: { "User-Agent": BROWSER_UA },
 signal: AbortSignal.timeout(8000),
 });
 const html = await res.text();
 const head = html.slice(0, 80000);
 const pick = (re: RegExp) => head.match(re)?.[1]?.trim() || null;
 const ogSite =
 pick(/property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i) ||
 pick(/content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i);
 const title = pick(/<title[^>]*>([^<]+)<\/title>/i);
 const color = pick(/name=["']theme-color["'][^>]*content=["'](#[0-9a-fA-F]{3,8})["']/i);
 const hero = pick(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
 let name = (ogSite || title || "")
 .replace(/[\u200B-\u200D\uFEFF\u00A0\u202A-\u202E]/g, "") // zero-width / control chars
 .trim();
 name = name.split(/\s+[|–—·-]\s+/)[0].trim(); // "Store — tagline" → "Store"
 const theme = extractTheme(head, origin, color);
 const platformHint = /cdn\.shopify|myshopify|Shopify\.theme/i.test(head)
 ? "shopify"
 : /squarespace|static1\.squarespace/i.test(head)
 ? "squarespace"
 : /wixstatic|wix\.com|warmupData/i.test(head)
 ? "wix"
 : /square\.site|squareup\.com|weebly/i.test(head)
 ? "square"
 : /woocommerce|wp-content|wp-json/i.test(head)
 ? "woocommerce"
 : /bigcommerce/i.test(head)
 ? "bigcommerce"
 : "unknown";
 const blocks = extractHomeBlocks(html, origin);
 // Currency is searched across the WHOLE document, not just the 80KB head slice — themes print
 // Shopify.currency in a footer script.
 // `html` rides along so platform detection can run on the SAME response we already fetched —
 // a second request could be served a different market/variant of the page.
 return { name: name.length >= 2 ? name : null, color, hero, theme, platformHint, blocks, currency: readCurrency(html), country: readHomeCountry(html), html };
 } catch {
 return empty;
 }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Size from a Squarespace variant — newer stores use optionValues, older use attributes. */
function sizeFromVariant(variant: any): string | null {
 const ov = variant?.optionValues;
 if (Array.isArray(ov)) {
 const s = ov.find((o: any) => /size/i.test(o?.optionName || ""));
 if (s?.value) return String(s.value).trim();
 }
 return variant?.attributes?.Size || variant?.attributes?.size || null;
}

/** Find a Squarespace store's *fullest* product collection — read the nav + sitemap,
 * score every commerce page, and prefer the biggest non-"sold" catalog. */
async function pickSquarespaceCollection(origin: string, startUrl: string): Promise<string | null> {
 const UA = { "User-Agent": BROWSER_UA };
 const candidates = new Set<string>(["/shop", "/shopall", "/shop-all", "/store", "/products", "/collections", "/all", "/catalog", ""]);
 try {
 const sp = new URL(startUrl).pathname.replace(/\/$/, "");
 if (sp) candidates.add(sp);
 } catch {
 /* ignore */
 }
 // nav links from the homepage
 try {
 const html = await safeFetch(origin, { headers: UA, signal: AbortSignal.timeout(8000) }).then((r) => r.text());
 for (const m of html.matchAll(/href=["'](\/[a-zA-Z0-9\-/]+)["']/g)) {
 const p = m[1].split("?")[0].replace(/\/$/, "");
 if (p && /shop|store|product|collection|catalog|browse|all/i.test(p) && p.split("/").length <= 3) candidates.add(p);
 }
 } catch {
 /* ignore */
 }
 // collection URLs from the sitemap
 try {
 const sm = await safeFetch(origin + "/sitemap.xml", { headers: UA, signal: AbortSignal.timeout(8000) }).then((r) => r.text());
 for (const m of sm.matchAll(/<loc>([^<]+)<\/loc>/g)) {
 try {
 const p = new URL(m[1]).pathname.replace(/\/$/, "");
 if (/shop|store|collection|catalog|all/i.test(p) && p.split("/").length <= 3) candidates.add(p);
 } catch {
 /* skip */
 }
 }
 } catch {
 /* ignore */
 }
 // score each candidate's first page of commerce items
 const scored = await Promise.all(
 [...candidates].slice(0, 16).map(async (p) => {
 try {
 const d: any = await safeFetch(origin + p + "?format=json", { headers: { ...UA, Accept: "application/json" }, signal: AbortSignal.timeout(7000) }).then((r) => (r.ok ? r.json() : null));
 const items = (d?.items || []).filter((it: any) => it.variants?.length);
 return { path: p, count: items.length, more: Boolean(d?.pagination?.nextPage) };
 } catch {
 return { path: p, count: 0, more: false };
 }
 }),
 );
 const isSold = (p: string) => /sold|archive|out.?of.?stock|past|previous/i.test(p);
 const best = scored
 .filter((s) => s.count > 0)
 .sort(
 (a, b) =>
 (isSold(a.path) ? 1 : 0) - (isSold(b.path) ? 1 : 0) || // real catalogs before "sold" archives
 (b.more ? 1 : 0) - (a.more ? 1 : 0) || // paginated (full) catalogs first
 b.count - a.count || // then most items
 a.path.length - b.path.length, // then the shortest (broadest) path
 )[0];
 return best ? origin + best.path : null;
}

/** Squarespace read: paginated ?format=json over a collection, commerce items only. */
async function fetchSquarespaceLite(shopUrl: string, max = 1500): Promise<ImportedProduct[]> {
 const base = shopUrl.replace(/\?.*$/, "");
 const out: ImportedProduct[] = [];
 try {
 let offset: number | undefined;
 for (let page = 0; page < 40 && out.length < max; page++) {
 const url = base + "?format=json" + (offset ? "&offset=" + offset : "");
 const res = await safeFetch(url, {
 headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
 signal: AbortSignal.timeout(8000),
 });
 if (!res.ok) break;
 const data = await res.json();
 const items: any[] = Array.isArray(data.items) ? data.items : [];
 if (!items.length) break;
 for (const it of items) {
 const variant = it.variants?.[0];
 if (!variant) continue;
 const cents = variant.onSale ? variant.salePrice : variant.price;
 const price = cents / 100;
 const available = Boolean(variant.unlimited) || (variant.qtyInStock ?? 0) > 0;
 // Keep sold items even though Squarespace zeroes their price (so they render
 // as "Sold" like the source); only skip a *live* item that has no price.
 if (price <= 0 && available) continue;
 const gallery = (it.items || []).map((g: any) => g.assetUrl).filter(Boolean);
 const image = gallery[0] || (it.assetUrl && /\.(jpe?g|png|webp|gif)/i.test(it.assetUrl) ? it.assetUrl : null);
 if (!image) continue;
 const description = String(it.excerpt || it.body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000) || null;
 const tags = [...(Array.isArray(it.categories) ? it.categories : []), ...(Array.isArray(it.tags) ? it.tags : [])].filter((t: any) => typeof t === "string");
 // Source identity, straight off the feed. Squarespace gives every product an `id`, a `urlSlug`
 // and the `fullUrl` of its own page, and this reader used to keep NONE of them — so every
 // Squarespace-imported piece arrived anonymous, linked on the mirrored storefront by its VYA
 // uuid, and the product route (which looks for `/products/{handle}`, Shopify's shape) had nothing
 // to resolve: every product click on those stores ended at "Couldn't load that product."
 // `urlSlug` over `id` because the slug is what the store's own URLs are keyed by.
 const urlSlug = typeof it.urlSlug === "string" ? it.urlSlug : "";
 const fullUrl = typeof it.fullUrl === "string" ? it.fullUrl : "";
 out.push({
  name: (it.title || "").trim(), price: price > 0 ? formatPrice(price, "USD") : "", image,
  images: gallery.length ? gallery : [image], description, size: sizeFromVariant(variant), available, tags,
  sourcePlatform: "squarespace",
  sourceId: urlSlug || (typeof it.id === "string" ? it.id : null) || null,
  sourceUrl: fullUrl ? new URL(fullUrl, base).toString() : null,
 });
 if (out.length >= max) break;
 }
 // Follow Squarespace's own pagination cursor to pull every page.
 if (!data.pagination?.nextPage) break;
 offset = data.pagination.nextPageOffset;
 if (!offset) break;
 }
 } catch {
 /* return whatever we gathered before the error */
 }
 return out;
}

/** Exact category membership from Shopify's PUBLIC collection endpoints — maps each product
 * HANDLE to the collection slugs it belongs to. Handles (not titles) because the handle is the
 * product's stable identity: it survives retitling, and two different one-of-one pieces that
 * happen to share a title stay distinct. This is the accurate way to fill collections (and the
 * Shop dropdown filter) rather than guessing from tags.
 *
 * Bounded on purpose: at most 25 collections × 6 pages, so a huge catalog can't turn one import
 * into thousands of outbound requests. */
export type CollectionMembershipRead = {
 /** product handle → the collection handles it belongs to. */
 membership: Map<string, string[]>;
 /** collection handle → its product handles in the SELLER'S OWN ORDER. Complete reads only; a
  *  collection missing from here has no live order and falls back to the captured page. */
 order: Map<string, string[]>;
 /** collection handle → how much of it SHE lists as unavailable. Absent for an unread collection:
  *  zero-of-zero would read as "she has no sold pieces", which is how a failed read would come to
  *  empty a seller's archive. See app/lib/collection-sold-policy.ts. */
 stock: Map<string, { unavailable: number; total: number }>;
 /** Collections read to the end without error — the only ones whose EMPTY answer we believe. */
 completed: Set<string>;
 /** Collections whose listing could NOT be read in full. Whatever they contributed to `membership`
  *  is partial, so the caller must never read it as "these are all the members". */
 incomplete: string[];
};

/** One page of a collection listing, retried through the transient throttling that a full-site
 *  crawl provokes — the membership pass runs seconds after we've just pulled ~60 pages and the
 *  product feed off the same host, which is exactly when a storefront starts refusing.
 *  Returns null when the page still won't read, so the caller can mark the collection UNREAD
 *  rather than silently treating it as empty. */
async function collectionPage(host: string, slug: string, page: number): Promise<CollectionPageResult> {
 const url = `https://${host}/collections/${slug}/products.json?limit=250&page=${page}`;
 // Server wobbles are retried here; a 429 is NOT. It is handed back to the caller, which knows the
 // store's pace and slows everything down — retrying it here for a second and giving up is what lost
 // blummier every collection from "ralph-lauren" to the end of the alphabet.
 for (let attempt = 0; attempt < 3; attempt++) {
  if (attempt) await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
  try {
   // Same browser UA as every other outbound import fetch. A bare request is the shape bot rules
   // reject first, and this was the only import fetch that didn't send one.
   const r = await safeFetch(url, { headers: { Accept: "application/json", "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(15000) });
   if (r.ok) {
    const d = parseLooseJson(await r.text()); // storefront feeds carry raw control chars
    return Array.isArray(d.products) ? d.products : [];
   }
   if (r.status === 429) {
    // The store's own Retry-After, in seconds, when it sends one.
    const after = parseInt(r.headers.get("Retry-After") ?? "", 10);
    return { throttled: true, ...(Number.isFinite(after) && after > 0 ? { retryAfterMs: Math.min(after * 1000, 60000) } : {}) };
   }
   // 404/403 is a settled answer — retrying it just hammers the store.
   if (r.status < 500) return null;
  } catch {
   /* timeout or transport error — retry, then give up as unread */
  }
 }
 return null;
}

export async function getShopifyCollectionMembership(domain: string, slugs: string[]): Promise<CollectionMembershipRead> {
 const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
 // The loop lives in collection-membership.ts so it can be tested without a network: it used to stop
 // after 25 collections, which is why ~500 collections across the fleet held nothing at all.
 const read = await readCollectionMembership(slugs, { fetchPage: (slug, page) => collectionPage(host, slug, page) });
 if (read.notAttempted.length) {
  console.log(`[collections] ${host}: ${read.notAttempted.length} collections past the ceiling were not read`);
 }
 if (read.throttleHits) console.log(`[collections] ${host}: asked to slow down ${read.throttleHits}\u00d7 — paced accordingly`);
 // A collection bigger than one pass. What we read is used; the shortfall is ours, not the seller's.
 if (read.truncated.length) console.log(`[collections] ${host}: ${read.truncated.length} collection(s) larger than one read (${read.truncated.slice(0, 3).join(", ")}) — filed as much as we could`);
 const out = new Map<string, string[]>();
 for (const [k, v] of read.membership) out.set(k, [...v]);
 // The order comes off the very same pages — no extra request. See syncCollectionOrder().
 return { membership: out, order: read.order, stock: read.stock, completed: read.completed, incomplete: read.incomplete };
}

/** Pull a store from a URL: Shopify public products.json, then Squarespace JSON. */
// 1,500 stopped short of three stores in the fleet (chill-boutique 1,837). The ceiling still exists
// so a runaway feed can't pin the process open — but hitting it is now recorded, and a read that
// hits it is never allowed to mark anything sold. See feed-completeness.ts.
export async function importStoreFromUrl(raw: string, max = 5000): Promise<ImportResult> {
 const u = await assertPublicUrl(raw); // DNS-resolves + rejects internal IPs (SSRF)
 if (!u) {
 return { ok: false, storeName: "", platform: "unknown", brandColor: null, hero: null, theme: null, products: [], error: "Enter a valid store URL." };
 }

 const origin = u.origin;
 const domain = u.hostname.replace(/^www\./, "");
 const meta = await readHomepage(origin);
 const storeName = meta.name || titleCase(domain.split(".")[0]);
 // One live detection drives which rungs are worth trying (and whether to try at all).
 const detection = detectPlatform(meta.html || "", u.href);

 let products: ImportedProduct[] = [];
 let platform: "shopify" | "squarespace" | "unknown" = "unknown";
 // Only the Shopify rung reports how its read finished; every other rung leaves this false, so a
 // store imported another way never licenses the sold-sweep. Safe by default, on purpose.
 let feedComplete = false;
 // See the note where this is filled: the ids the feed listed, whether or not each became an item.
 let feedSourceIds: string[] = [];

 // 1) Shopify public products.json (no token needed)
 try {
 // Pass the shop's REAL currency (read from its storefront) instead of assuming USD.
 const shopCurrency = meta.currency || "USD";
 // On timeout the fallback carries NO outcome — which readEndedCleanly treats as an incomplete
 // read, so an empty feed from a slow store can never be read as "the shop is empty now".
 // 25s was not enough for a real catalogue: chill-boutique's 1,791 pieces are 36 sequential
 // requests, and a throttle retry on top pushed it over, which returned an EMPTY feed. Harmless now
 // that an empty read can never sweep — but it also meant the store simply did not import.
 const r = await withTimeout(fetchShopifyProductsPublic(domain, storeName, max, shopCurrency, true, meta.country), 60000, { products: [], skippedCount: 0 });
 const shopifyComplete = r.outcome ? readEndedCleanly(r.outcome) : false;
 // Every source id the read SAW, before the image filter below drops any. A piece with no photo is
 // not a piece that has been taken down, and without this it fell out of `products`, looked gone,
 // and was marked sold.
 feedSourceIds = r.products.map((p) => p.handle || p.shopifyProductId || null).filter(Boolean) as string[];
 const mapped = r.products
 .filter((p) => p.image)
 .slice(0, max)
 .map((p) => ({
 name: p.title,
 price: p.price != null ? formatPrice(p.price, p.currency) : "",
 priceCents: p.price != null ? Math.round(p.price * 100) : null,
 // The seller's markdown. Their feed carries it and the client already parses it; it used to be
 // dropped here, so a shop running a sale showed a flat price and lost the markdown.
 compareAtCents: p.compareAtPrice != null ? Math.round(p.compareAtPrice * 100) : null,
 currency: p.currency || shopCurrency,
 image: p.image as string,
 images: p.images?.length ? p.images : p.image ? [p.image] : [],
 description: p.description || null,
 size: p.size || null,
 available: p.availableForSale !== false,
 tags: p.tags || [],
 // Identity: prefer the handle (stable, human-readable, survives retitling) then the numeric id.
 sourcePlatform: "shopify",
 sourceId: p.handle || p.shopifyProductId || null,
 sourceUrl: p.externalUrl || null,
 variants: p.variants || [],
 }));
 if (mapped.length) {
 platform = "shopify";
 products = mapped;
 // Only now: the completeness of the Shopify read describes the Shopify read. Setting it earlier
 // meant a complete-but-unusable Shopify read licensed a sweep against a LATER rung's partial data.
 feedComplete = shopifyComplete;
 }
 } catch {
 /* fall through to squarespace */
 }

 // 2) Squarespace — discover the fullest product collection, then paginate it.
 if (!products.length) {
 const best = await pickSquarespaceCollection(origin, u.href);
 if (best) {
 const found = await fetchSquarespaceLite(best, max);
 if (found.length) {
 platform = "squarespace";
 products = found;
 }
 }
 }

 // 3) WooCommerce — its public Store API is as clean as Shopify's feed (prices in minor units
 // with an explicit currency), it just was never wired up.
 let blocked: BlockedByStoreError | null = null;
 if (!products.length && (detection.platform === "woocommerce" || detection.platform === "wordpress")) {
 try {
 const woo = await fetchWooProducts(origin, max);
 if (woo.length) { platform = "unknown"; products = woo; }
 } catch (e) { if (e instanceof BlockedByStoreError) blocked = e; }
 }

 // 4) Generic rung: sitemap → product pages → schema.org JSON-LD. No feed required, so it covers
 // BigCommerce, Webflow and most custom server-rendered stores. Slower (a request per product),
 // hence the caps inside fetchViaJsonLd.
 if (!products.length && !detection.shell.isShell && detection.platform !== "wix") {
 try {
 const viaLd = await fetchViaJsonLd(origin, detection.platform, Math.min(max, 400));
 if (viaLd.length) { platform = "unknown"; products = viaLd; }
 } catch (e) { if (e instanceof BlockedByStoreError) blocked = e; }
 }

 if (!products.length) {
 // An honest, specific explanation beats a generic failure: say WHAT the site is and what the
 // seller can do instead (see declineMessage), rather than implying we simply couldn't be bothered.
 const decline = blocked
  ? "This store is refusing automated requests, so we couldn't read its catalog. You can upload your inventory as a CSV, or connect the store's platform directly."
  : declineMessage(detection);
 if (decline) {
 return { ok: false, storeName, platform, brandColor: meta.color, hero: meta.hero, theme: meta.theme, products: [], error: decline };
 }
 const messages: Record<string, string> = {
 wix: "This looks like a Wix store. Automatic import for Wix isn’t supported yet — you can add your items manually for now.",
 square: "This looks like a Square Online store. Automatic import for Square isn’t supported yet — you can add your items manually for now.",
 woocommerce: "This looks like a WooCommerce store. Automatic import for WooCommerce isn’t supported yet — you can add your items manually for now.",
 bigcommerce: "This looks like a BigCommerce store. Automatic import isn’t supported yet — you can add your items manually for now.",
 shopify: "We detected Shopify but couldn’t read products — the store may be password-protected or hiding its public catalog.",
 squarespace: "We detected Squarespace but couldn’t find a product collection — add your items manually, or check that the shop page is public.",
 unknown: "We couldn’t read products from this site. It may be password-protected, built without a supported store platform, or render products only in the browser. You can add your items manually.",
 };
 return {
 ok: false,
 storeName,
 platform,
 brandColor: meta.color,
 hero: meta.hero,
 theme: meta.theme,
 products: [],
 error: messages[meta.platformHint] || messages.unknown,
 };
 }

 return { ok: true, storeName, platform, brandColor: meta.color, hero: meta.hero, theme: meta.theme, products, blocks: meta.blocks, feedComplete, feedSourceIds: feedComplete ? feedSourceIds : [] };
}

/** Homepage-only: a section-by-section replica of the source home as studio blocks.
 *  Cheap (one homepage fetch, no product crawl) — used to seed the visual builder on
 *  capture without re-running the full product import. */
export async function importStoreBlocks(raw: string): Promise<HomeBlock[]> {
 const u = await assertPublicUrl(raw);
 if (!u) return [];
 const meta = await readHomepage(u.origin).catch(() => null);
 return meta?.blocks || [];
}

// Like importStoreBlocks, but also returns the store's OWN theme (real colours, fonts, logo) and brand
// name — so an import can look like their site, not our starter theme. One homepage read, both outputs.
export async function importStoreThemeAndBlocks(raw: string): Promise<{ theme: StorefrontTheme | null; blocks: HomeBlock[]; name: string | null }> {
 const u = await assertPublicUrl(raw);
 if (!u) return { theme: null, blocks: [], name: null };
 const meta = await readHomepage(u.origin).catch(() => null);
 return { theme: meta?.theme || null, blocks: meta?.blocks || [], name: meta?.name || null };
}
