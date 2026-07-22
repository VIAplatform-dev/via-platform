import { fetchShopifyProductsPublic } from "@/app/lib/shopifyClient";
import { formatPrice } from "@/app/lib/formatPrice";
import { safeUrl } from "@/app/lib/safe-url";
import type { StoreProfile } from "@/app/lib/store-profile";

// ───────────────────────────────────────────────────────────────────────────
// Pull a real storefront (Shopify / Squarespace) from a pasted URL — name, brand
// color, and products + images. Shared by the public /infrastructure demo AND
// the real seller onboarding import (which persists the result as a VYA store).
// ───────────────────────────────────────────────────────────────────────────

export type ImportedProduct = {
 name: string;
 price: string;
 image: string;
 images?: string[];
 description?: string | null;
 size?: string | null;
 available?: boolean; // false = sold out on the source site
 tags?: string[]; // category/collection tags (for the Shop dropdown filter)
};

/** A storefront's visual identity + cloned structure, pulled from the source site. */
export type StorefrontTheme = {
 fonts?: { heading?: string; body?: string };
 colors?: { bg?: string; text?: string; accent?: string };
 customCss?: string; // raw custom CSS layered over the storefront — AI- or hand-written; targets .vya-* classes
 template?: string; // chosen starter template id (storefront-templates.ts) — drives hero style
 blocks?: { id: string; type: string; props: Record<string, string>; style?: { bg?: string } }[]; // section-based home page (storefront-blocks.ts)
 shopBlocks?: { id: string; type: string; props: Record<string, string>; style?: { bg?: string } }[]; // editable intro content shown ABOVE the product grid on the Shop page
 extraPages?: { slug: string; title: string; blocks: { id: string; type: string; props: Record<string, string>; style?: { bg?: string } }[] }[]; // additional block-based pages
 logo?: string | null;
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
 error?: string;
};

// SSRF guard lives in ./safe-url so the site-capture crawler shares the exact same allow-list.

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
 return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

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

 return { fonts, colors: Object.keys(colors).length ? colors : undefined, logo };
}

/** Pull store name / brand color / platform hints from the homepage <head>. */
async function readHomepage(origin: string) {
 const empty = { name: null as string | null, color: null as string | null, hero: null as string | null, theme: null as StorefrontTheme | null, platformHint: "unknown" as string };
 try {
 const res = await fetch(origin, {
 headers: { "User-Agent": "Mozilla/5.0 (compatible; VYA-Importer/1.0)" },
 signal: AbortSignal.timeout(8000),
 });
 const head = (await res.text()).slice(0, 80000);
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
 return { name: name.length >= 2 ? name : null, color, hero, theme, platformHint };
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
 const UA = { "User-Agent": "Mozilla/5.0 (compatible; VYA-Importer/1.0)" };
 const candidates = new Set<string>(["/shop", "/shopall", "/shop-all", "/store", "/products", "/collections", "/all", "/catalog", ""]);
 try {
 const sp = new URL(startUrl).pathname.replace(/\/$/, "");
 if (sp) candidates.add(sp);
 } catch {
 /* ignore */
 }
 // nav links from the homepage
 try {
 const html = await fetch(origin, { headers: UA, signal: AbortSignal.timeout(8000) }).then((r) => r.text());
 for (const m of html.matchAll(/href=["'](\/[a-zA-Z0-9\-/]+)["']/g)) {
 const p = m[1].split("?")[0].replace(/\/$/, "");
 if (p && /shop|store|product|collection|catalog|browse|all/i.test(p) && p.split("/").length <= 3) candidates.add(p);
 }
 } catch {
 /* ignore */
 }
 // collection URLs from the sitemap
 try {
 const sm = await fetch(origin + "/sitemap.xml", { headers: UA, signal: AbortSignal.timeout(8000) }).then((r) => r.text());
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
 const d: any = await fetch(origin + p + "?format=json", { headers: { ...UA, Accept: "application/json" }, signal: AbortSignal.timeout(7000) }).then((r) => (r.ok ? r.json() : null));
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
 const res = await fetch(url, {
 headers: { "User-Agent": "Mozilla/5.0 (compatible; VYA-Importer/1.0)", Accept: "application/json" },
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
 out.push({ name: (it.title || "").trim(), price: price > 0 ? formatPrice(price, "USD") : "", image, images: gallery.length ? gallery : [image], description, size: sizeFromVariant(variant), available, tags });
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

/** Exact category membership from Shopify's PUBLIC collection endpoints — maps each
 * product title to the collection slugs it belongs to. This is the accurate way to
 * power the Shop dropdown filter (vs guessing from tags). */
export async function getShopifyCollectionMembership(domain: string, slugs: string[]): Promise<Map<string, string[]>> {
 const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
 const membership = new Map<string, Set<string>>();
 for (const slug of slugs.slice(0, 25)) {
 try {
 for (let page = 1; page <= 6; page++) {
 const r = await fetch(`https://${host}/collections/${slug}/products.json?limit=250&page=${page}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
 if (!r.ok) break;
 const d = await r.json();
 const prods: any[] = Array.isArray(d.products) ? d.products : [];
 if (!prods.length) break;
 for (const p of prods) {
 const key = String(p.title || "").toLowerCase().trim();
 if (!key) continue;
 if (!membership.has(key)) membership.set(key, new Set());
 membership.get(key)!.add(slug);
 }
 if (prods.length < 250) break;
 }
 } catch {
 /* skip a collection that errors */
 }
 }
 const out = new Map<string, string[]>();
 for (const [k, v] of membership) out.set(k, [...v]);
 return out;
}

/** Pull a store from a URL: Shopify public products.json, then Squarespace JSON. */
export async function importStoreFromUrl(raw: string, max = 1500): Promise<ImportResult> {
 const u = safeUrl(raw);
 if (!u) {
 return { ok: false, storeName: "", platform: "unknown", brandColor: null, hero: null, theme: null, products: [], error: "Enter a valid store URL." };
 }

 const origin = u.origin;
 const domain = u.hostname.replace(/^www\./, "");
 const meta = await readHomepage(origin);
 const storeName = meta.name || titleCase(domain.split(".")[0]);

 let products: ImportedProduct[] = [];
 let platform: "shopify" | "squarespace" | "unknown" = "unknown";

 // 1) Shopify public products.json (no token needed)
 try {
 const r = await withTimeout(fetchShopifyProductsPublic(domain, storeName, max, "USD", true), 25000, { products: [], skippedCount: 0 });
 const mapped = r.products
 .filter((p) => p.image)
 .slice(0, max)
 .map((p) => ({
 name: p.title,
 price: p.price != null ? formatPrice(p.price, p.currency) : "",
 image: p.image as string,
 images: p.images?.length ? p.images : p.image ? [p.image] : [],
 description: p.description || null,
 size: p.size || null,
 available: p.availableForSale !== false,
 tags: p.tags || [],
 }));
 if (mapped.length) {
 platform = "shopify";
 products = mapped;
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

 if (!products.length) {
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

 return { ok: true, storeName, platform, brandColor: meta.color, hero: meta.hero, theme: meta.theme, products };
}
