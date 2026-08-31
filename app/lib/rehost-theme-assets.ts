import { put, list } from "@vercel/blob";
import crypto from "crypto";
import * as cheerio from "cheerio";
import type { Element as DomElement } from "domhandler";
import { isDeniedScriptUrl } from "./plan-b/scripts.ts";
import { isPermanentlyGone, recordDeadAsset, knownDeadAssets } from "./dead-assets.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Re-host a captured store's THEME assets — its JavaScript, fonts, logo and
// section images — onto VYA's own Blob storage.
//
// rehost-images.ts already does this for PRODUCT photos, which is why they are the
// one thing that survives a seller cancelling Shopify. Everything else the theme
// needs is still fetched from the seller's own Shopify at request time, so the day
// they cancel — the day the whole migration is for — those files stop being served.
// Measured on the real fleet by blocking every Shopify host: `blummier` loses only
// its logo, but `we-thieves` loses its header and navigation, and `bag-crush` stops
// rendering half its products.
//
// TIMING IS THE POINT. The copy can only be taken while the seller's Shopify is
// still alive. Afterwards the bytes are gone and no re-crawl can recover them, so
// this belongs in the import (and as a backfill for stores already captured), never
// as something to get round to later.
//
// Idempotent: the blob key is a hash of the source URL, so re-running reuses the
// same object. Fails SOFT per asset — one unreachable font must not cost a store
// its JavaScript.
// ─────────────────────────────────────────────────────────────────────────────

/** Assets worth owning. Deliberately excludes .html and anything without an extension we
 *  recognise — a captured page must never start pulling another page into Blob. */
// No `.css`. A stylesheet's own `url(...)` references resolve relative to WHERE THE FILE LIVES —
// blummier's base.css says `url(./sparkle.gif)` — so copying it to Blob breaks every one of them,
// trading an asset the /cdn proxy serves correctly for one that 404s. The stylesheets a capture
// INLINES are already handled (their url()s are collected below); external ones stay proxied
// until stylesheet dependencies are rehosted recursively, which this deliberately does not attempt.
// Video too. A hero is routinely a <video>, and the blackout gate found one rendering as a beige
// void with every image metric reporting "unchanged" — the only aborted request on the page was
// /cdn/shop/videos/…/HD-1080p.mp4, which this list had never made a candidate.
const ASSET_RE = /\.(js|mjs|woff2?|ttf|otf|eot|png|jpe?g|gif|webp|avif|heic|svg|ico|mp4|webm|mov|m3u8)(\?|$)/i;

const CONTENT_TYPES: Record<string, string> = {
 js: "text/javascript", mjs: "text/javascript", css: "text/css",
 woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", eot: "application/vnd.ms-fontobject",
 png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", heic: "image/heic",
 webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", ico: "image/x-icon",
 mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m3u8: "application/vnd.apple.mpegurl",
};

export type RehostResult = {
 pages: number; candidates: number; rehosted: number; failed: number; skipped: number; bytes: number;
 failures: string[];
 /** True when candidates were left untaken — by the time budget, the cap, or fetch failures. The
  *  next run picks them up: already-rehosted URLs are skipped, so this converges without a "done"
  *  marker that could ever say done when it isn't. */
 incomplete: boolean;
};

function isOurs(url: string): boolean {
 return url.includes(".public.blob.vercel-storage.com");
}

function extOf(url: string): string {
 const m = url.split("?")[0].match(/\.([a-z0-9]+)$/i);
 return (m?.[1] || "bin").toLowerCase();
}

/**
 * Every asset URL a captured page refers to — from markup AND from the stylesheets the capture
 * inlined. The CSS half matters more than it sounds: fonts and background images live in `url(...)`
 * declarations, never in an attribute, and a store's logo or hero is routinely a CSS background.
 * Missing them is exactly how a page keeps its layout but loses its branding.
 */
export function collectAssetUrls(html: string, origin: string | null, productFiles?: Set<string>): string[] {
 const out = new Set<string>();
 const add = (raw: string | undefined, fromCss = false) => {
  const v = (raw || "").trim();
  if (!v || v.startsWith("data:") || v.startsWith("blob:")) return;
  // Both shapes occur across the fleet: some captures stored absolute source URLs, others
  // root-relative `/cdn/…`. Normalising here means the caller only ever deals in absolute.
  let abs = v;
  if (v.startsWith("//")) abs = "https:" + v;
  else if (v.startsWith("/")) { if (!origin) return; abs = origin.replace(/\/$/, "") + v; }
  else if (!/^https?:\/\//i.test(v)) return; // a relative path inside inlined CSS — origin unknowable
  // Shopify serves theme FONTS at extensionless URLs (`/cdn/fonts/karla/karla_n4.<hash>`), so an
  // extension test alone drops every font on the page; the content-type on the response supplies
  // the extension for the Blob key (see rehostAsset).
  if (!ASSET_RE.test(abs) && !/\/cdn\/fonts\//i.test(abs)) return;
  if (isOurs(abs)) return;
  // PRODUCT photos are not theme assets. They are already re-hosted by the rehost-images cron and
  // served from Blob at render time; the URLs still sitting in a captured grid are the crawler's
  // frozen snapshot, and every one of them appears ten times over at different `?width=` sizes.
  // Sweeping them in turned "20 theme files" into 51,396 candidates on one store. Shopify keeps
  // product media under /cdn/shop/files and /cdn/shop/products; the theme's own assets live under
  // /cdn/shop/t/<n>/assets, and a logo a theme references from /files is caught by the CSS pass
  // below regardless of where it lives, since that is keyed on the reference, not the path.
  // A product photo is one whose file the ITEMS table already owns — that is the only reliable
  // tell. Every URL shape was tried first and every one was wrong: Shopify's image_url filter adds
  // `?width=` to EVERY image a theme renders, so keying on it excluded the logo, the hero and all
  // twelve section images on the test store while the blackout gate reported them lost. Product
  // photos are the image cron's job and already sit on Blob; everything else the theme shows is ours
  // to keep. Without the set, take all images — over-copying is cheap, under-copying loses branding.
  if (productFiles && !fromCss && /\.(jpe?g|png|webp|gif|avif)/i.test(abs)) {
   const base = abs.split("?")[0].split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") || "";
   if (base && productFiles.has(base)) return;
  }
  if (isDeniedScriptUrl(abs)) return; // trackers and popup apps are dropped at serve time, not owned
  out.add(abs);
 };

 const $ = cheerio.load(html);
 const els = (sel: string) => $(sel).toArray() as DomElement[];
 for (const el of els("script[src]")) add($(el).attr("src"));
 for (const el of els("link[href]")) add($(el).attr("href"));
 // Product-card images are taken too. Skipping them (on the theory that live inventory replaces
 // every product grid at serve time) had a counterexample on the first fresh crawl: a product strip
 // in the site chrome renders on every page, is never replaced, and its two photos were the only
 // things still loading from Shopify. Every earlier rule for telling card images apart — basenames
 // in items.images, `?width=`, link ancestry — was wrong in some real store. Copying a few hundred
 // extra photos per store is cheaper than a hosted store that quietly loses two images per page;
 // the srcset collapse in pickVariant is what keeps the cost sane, not exclusion.
 for (const el of els("img[src]")) add($(el).attr("src"));
 for (const el of els("video[src], video[poster], source[src], [data-video-src], [data-src]")) {
  for (const a of ["src", "poster", "data-video-src", "data-src"]) add($(el).attr(a));
 }
 // CANDIDATE LISTS. `imagesrcset` is the preload form; `data-bgset` is how lazysizes carries a
 // background image — we-thieves' collection hero was one, and it is one of only two assets the
 // whole fleet actually lost at cancellation, because nobody had ever read the attribute.
 for (const attr of ["srcset", "data-srcset", "imagesrcset", "data-bgset"]) {
  for (const el of els(`[${attr}]`)) {
   for (const part of ($(el).attr(attr) || "").split(",")) add(part.trim().split(/\s+/)[0]);
  }
 }
 // SINGLE URLS a theme stashes for its own JavaScript to read later. No server-side rewrite reaches
 // what the theme builds at runtime, but these are written into the markup, so they can be taken.
 // `data-video-source` is ange-archive's hero video — the other real loss in the fleet.
 for (const attr of ["data-video-source", "data-featured-media-url", "data-product-variant-media", "data-original-src", "data-image", "data-poster"]) {
  for (const el of els(`[${attr}]`)) add($(el).attr(attr));
 }
 // SIZE TEMPLATES. One theme writes `…/t_{size}.jpg` and substitutes a width in JavaScript. Fetching
 // the literal string 404s; asking for one real size gets the file, and one size is enough — the
 // page is re-rendered from live inventory anyway, so this is about the theme's own imagery.
 for (const el of els("[data-rimg-template]")) {
  const t = $(el).attr("data-rimg-template") || "";
  if (t.includes("{size}")) add(t.replace(/\{size\}/g, "1024x"));
 }
 // THE SHARE CARD. Never rendered, so no check has ever noticed it — and every social preview
 // breaks the day a seller cancels. Between 6 and 304 URLs per store across the fleet.
 for (const el of els('meta[property="og:image"], meta[property="og:image:secure_url"], meta[name="twitter:image"]')) {
  add($(el).attr("content"));
 }
 // IMPORT MAPS. Modern Shopify themes load their JavaScript through `<script type="importmap">` —
 // a JSON object whose values are the module URLs — not through `src` attributes. One store's
 // entire theme (`vendor.bundle.min.js`, `data-island.bundle.js`) was referenced only there, so
 // it was never a candidate and the whole theme died under blackout. Parse the map, take every URL.
 for (const el of els('script[type="importmap"]')) {
  try {
   const map = JSON.parse($(el).html() || "{}") as { imports?: Record<string, string>; scopes?: Record<string, Record<string, string>> };
   for (const v of Object.values(map.imports || {})) add(v);
   for (const scope of Object.values(map.scopes || {})) for (const v of Object.values(scope)) add(v);
  } catch { /* not JSON — nothing to take */ }
 }
 // `url(...)` in inlined <style> blocks and inline style attributes.
 const css: string[] = [];
 for (const el of els("style")) css.push($(el).html() || "");
 for (const el of els("[style]")) css.push($(el).attr("style") || "");
 for (const block of css) {
  for (const m of block.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) add(m[1], true);
 }
 return [...out];
}


/** The URL with Shopify's sizing parameters removed — `width=`, `height=`, `crop=` — so every rung
 *  of a srcset ladder shares one key. The `v=` fingerprint stays: it identifies the file. */
export function variantKey(url: string): string {
 const [base, q = ""] = url.split("?");
 const kept = q.split("&").filter((kv) => kv && !/^(width|height|crop)=/i.test(kv));
 return kept.length ? `${base}?${kept.join("&")}` : base;
}

/** ONE upload per file. A theme emits a srcset ladder — up to 26 `?width=` variants of the same
 *  image, each a distinct file on Shopify's side — and copying every rung turned 460 files into
 *  3,560 uploads. Pick the largest variant at or under the cap (so a 13 MB original is never the
 *  one taken), and the caller points every rung at it. Trade-off, stated plainly: a phone then
 *  downloads a larger image than the ladder would have chosen for it. */
export function pickVariant(urls: string[], capPx = 2048): string {
 const w = (u: string) => Number(u.match(/[?&]width=(\d+)/i)?.[1] ?? 0);
 const under = urls.filter((u) => w(u) > 0 && w(u) <= capPx).sort((a, b) => w(b) - w(a));
 if (under.length) return under[0];
 const sized = urls.filter((u) => w(u) > 0).sort((a, b) => w(a) - w(b));
 return sized[0] ?? urls[0];
}

/** Copy one asset to Blob. Returns the Blob URL, or null when it could not be taken. */
/**
 * Everything we already hold for a store, from ONE listing instead of one call per asset.
 *
 * rehostAsset used to ask Blob "do I have this?" once per asset. montrose-edit has 8,213 of them,
 * four at a time — around 2,000 sequential round trips, 31 minutes of a fleet run, to be told "yes"
 * 8,213 times. A paginated listing answers all of it in about nine calls.
 *
 * Keyed by STEM (the sha1 of the source URL) because the extension is decided by the response's
 * content-type, which we do not know until we fetch — the same reason the per-asset check matched
 * on `stem + "."` rather than on a full pathname.
 */
export function blobIndexFrom(blobs: { pathname: string; url: string; size: number }[]): Map<string, { url: string; bytes: number }> {
 const out = new Map<string, { url: string; bytes: number }>();
 for (const b of blobs) {
  const stem = b.pathname.replace(/\.[a-z0-9]+$/i, "");
  // First wins: a file re-copied after its content-type changed leaves two objects on one stem, and
  // picking deterministically stops a page flapping between them.
  if (!out.has(stem)) out.set(stem, { url: b.url, bytes: b.size });
 }
 return out;
}

/** Read the whole store's prefix, one page at a time. Empty on any failure — we then just ask per asset. */
export async function loadBlobIndex(slug: string): Promise<Map<string, { url: string; bytes: number }>> {
 if (!process.env.BLOB_READ_WRITE_TOKEN) return new Map();
 const all: { pathname: string; url: string; size: number }[] = [];
 let cursor: string | undefined;
 for (let page = 0; page < 60; page++) {
  const res = await list({ prefix: `theme/${slug}/`, limit: 1000, cursor }).catch(() => null);
  if (!res) break;
  all.push(...res.blobs);
  if (!res.hasMore || !res.cursor) break;
  cursor = res.cursor;
 }
 return blobIndexFrom(all);
}

export async function rehostAsset(sourceUrl: string, slug: string, index?: Map<string, { url: string; bytes: number }>, dead?: Set<string>): Promise<{ url: string; bytes: number } | null> {
 if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
 try {
  // Already ours? A crawl that pauses and resumes in a new invocation starts with an empty cache,
  // and re-downloading a 32 MB hero video from the seller to re-upload an identical object is the
  // wrong way to find out. One list call answers it.
  const stem = `theme/${slug}/${crypto.createHash("sha1").update(sourceUrl).digest("hex").slice(0, 16)}`;
  // The store's whole prefix, read once by the caller, answers this without a network call. Falls
  // back to asking about this one asset when no index was supplied (a single-page re-host).
  if (index) {
   const known = index.get(stem);
   if (known) return known.bytes >= 0 ? { url: known.url, bytes: known.bytes } : null;
  }
  if (dead?.has(sourceUrl)) return null; // her server has already told us this file is not there
  const have = index ? null : await list({ prefix: stem, limit: 3 }).catch(() => null);
  // Match on the stem: the extension may come from the content-type, which we don't know yet.
  const hit = have?.blobs.find((b) => b.pathname.startsWith(stem + "."));
  if (hit) return { url: hit.url, bytes: hit.size };
  const res = await fetch(sourceUrl, {
   // The same browser UA every other outbound import fetch uses: a bare request is what bot rules
   // reject first, and a 403 here silently costs the store its JavaScript.
   headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" },
   // Video gets minutes, not seconds. A 1080p hero is tens of MB; the 20s that suits a font or a
   // script left every store's hero video "could not take" — and the blackout gate then reported
   // "/: video" on each of them. That was this timeout, not Shopify refusing the file.
   signal: AbortSignal.timeout(/\.(mp4|mov|webm|m3u8)(\?|$)/i.test(sourceUrl) ? 300_000 : 20_000),
  });
  if (!res.ok) {
   // Gone for good? Remember it, so the next run does not spend another minute finding out. Only a
   // definitive "not here" counts — a throttle or a 5xx is tried again. See dead-assets.ts.
   if (isPermanentlyGone(res.status)) await recordDeadAsset(slug, sourceUrl, res.status);
   return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.byteLength) return null;
  const contentType = res.headers.get("content-type")?.split(";")[0] || CONTENT_TYPES[extOf(sourceUrl)] || "application/octet-stream";
  // Extension from the URL when it has one, else from the content-type (extensionless fonts).
  const byType: Record<string, string> = { "font/woff2": "woff2", "font/woff": "woff", "font/ttf": "ttf", "font/otf": "otf", "application/font-woff2": "woff2", "application/font-woff": "woff", "application/x-font-ttf": "ttf" };
  const ext = extOf(sourceUrl) !== "bin" && !/\/cdn\/fonts\//i.test(sourceUrl) ? extOf(sourceUrl) : (byType[contentType] || extOf(sourceUrl));
  const blob = await put(`${stem}.${ext}`, buf, {
   access: "public", contentType, addRandomSuffix: false, allowOverwrite: true,
  });
  // Remember it, so the next page referencing the same file answers from memory rather than
  // re-listing — the same asset appears on every page of a store's theme.
  index?.set(stem, { url: blob.url, bytes: buf.byteLength });
  return { url: blob.url, bytes: buf.byteLength };
 } catch {
  return null;
 }
}

/** Replace every reference to `from` with `to`, in both the absolute and root-relative shapes a
 *  capture may hold. Plain string replacement, never a regex over the URL: these carry `?v=` query
 *  strings and regex-significant characters, and dropping a query string here would point the page
 *  at a different build of the same file. */
function rewriteAll(html: string, from: string, to: string, origin: string | null): string {
 // EVERY textual form the same URL takes in a capture, not just the absolute one the collector
 // normalised it to. Stored pages hold `//wethieves.com/cdn/…` (protocol-relative, inside inline
 // `style="background: url(…)"`) and root-relative `/cdn/…`, and the raw text writes `&` as
 // `&amp;`. Rewriting only `https://…` matched none of those — three backgrounds and seventeen
 // image refs stayed on Shopify after a "successful" rehost. Longest form first, so a root-relative
 // rewrite can never eat the tail of an absolute one.
 const forms = new Set<string>();
 const m = from.match(/^https?:(\/\/[^/]+)(\/.*)$/);
 forms.add(from);
 if (m) { forms.add(m[1] + m[2]); forms.add("http:" + m[1] + m[2]); forms.add("https:" + m[1] + m[2]); }
 if (origin && from.startsWith(origin)) { const rel = from.slice(origin.replace(/\/$/, "").length); if (rel.startsWith("/")) forms.add(rel); }
 for (const f of [...forms]) if (f.includes("&")) forms.add(f.split("&").join("&amp;"));
 let out = html;
 for (const f of [...forms].sort((a, b) => b.length - a.length)) {
  // Root-relative and protocol-relative forms are rewritten only when delimited — as a whole
  // attribute value or `url(...)` argument — so `/cdn/x.js` cannot match inside `/cdn/x.js?v=2`
  // or inside an unrelated longer path.
  if (f === from || f.startsWith("http")) { out = out.split(f).join(to); continue; }
  for (const [pre, post] of [['"', '"'], ["'", "'"], ["url(", ")"], ["url('", "')"], ['url("', '")'], ["(", ")"]]) out = out.split(pre + f + post).join(pre + to + post);
 }
 return out;
}

/**
 * Rewrite EVERY rehosted URL in a page in ONE pass.
 *
 * The previous shape — for each url, for each textual form, for each delimiter, split/join the whole
 * page — is pages × urls × ~70 full-page scans. thenicheshop (369 pages, ~6,000 urls, ~500 KB each)
 * sat at 100% CPU for five hours. This scans the page once for URL-shaped tokens and looks each up:
 * absolute forms (`https://…`, `http://…`, with `&` or `&amp;`) rewrite anywhere and keep an unknown
 * query tail; protocol-relative (`//host/…`) and root-relative (`/cdn/…`) forms rewrite only as a whole
 * delimited value — a quoted attribute or a `url(…)` argument — so `/cdn/x.js` never touches
 * `/cdn/x.js?v=2`. Same semantics as before, minus the hours.
 */
export function rewritePageUrls(html: string, map: Map<string, string>, origin: string | null): string {
 if (!map.size) return html;
 const abs = new Map<string, string>();
 const rel = new Map<string, string>();
 const add = (into: Map<string, string>, f: string, to: string) => { into.set(f, to); if (f.includes("&")) into.set(f.split("&").join("&amp;"), to); };
 const originBare = origin ? origin.replace(/\/$/, "") : null;
 for (const [from, to] of map) {
  add(abs, from, to);
  const m = from.match(/^https?:(\/\/[^/]+)(\/.*)$/);
  if (m) { add(abs, "http:" + m[1] + m[2], to); add(abs, "https:" + m[1] + m[2], to); add(rel, m[1] + m[2], to); }
  if (originBare && from.startsWith(originBare)) { const r = from.slice(originBare.length); if (r.startsWith("/")) add(rel, r, to); }
 }
 const TOKEN = /(?:https?:)?\/\/[^\s"'()<>,]+|\/[^\s"'()<>,]+/g;
 return html.replace(TOKEN, (tok: string, offset: number) => {
  if (tok.startsWith("http")) {
   const hit = abs.get(tok);
   if (hit) return hit;
   const q = tok.indexOf("?");
   if (q > 0) { const h = abs.get(tok.slice(0, q)); if (h) return h + tok.slice(q); }
   return tok;
  }
  // WHAT MAY SIT EITHER SIDE OF A REFERENCE.
  //
  // The old guard demanded a quote or bracket on both sides, which describes `src="/a.jpg"` and
  // `url(/a.jpg)` and nothing else. A srcset entry is followed by a width descriptor and a comma —
  // `srcset="//host/a.jpg 400w, //host/b.jpg 800w"` — so every entry was rejected, and the assets
  // were copied to our storage and then left pointing at the seller's. 104 URLs on one store.
  //
  // So a comma or whitespace counts as a delimiter too. Deliberately NOT "anything": a bare path in
  // prose ("our files live at /cdn/shop/files/a.jpg") still has to be left alone, which is why the
  // opening side must still be a quote, a bracket, a comma or the whitespace that follows one.
  const pre = html[offset - 1] ?? "", post = html[offset + tok.length] ?? "";
  const preOk = /["'(,]/.test(pre) || (/\s/.test(pre) && /[,"'(]/.test((html.slice(0, offset).match(/\S(?=\s*$)/) || [""])[0]));
  const postOk = /["')]/.test(post) || /[\s,]/.test(post);
  if (!preOk || !postOk) return tok;
  return rel.get(tok) ?? tok;
 });
}

/**
 * Re-host ONE page's assets as it is captured, and return the rewritten HTML.
 *
 * This is where the copying belongs: inside the crawl, in the same pass that already inlines the
 * page's stylesheets — so every page is stored already owning what it needs, and there is no
 * second scan, no "incomplete" state and no sweeper to finish it. `cache` is shared across the
 * crawl (an asset on 90 pages uploads once); `take` is injectable so this is testable offline.
 */
export async function rehostPageAssets(
 html: string,
 origin: string | null,
 slug: string,
 cache: Map<string, string>,
 take: (url: string) => Promise<{ url: string; bytes: number } | null> = (u) => rehostAsset(u, slug),
): Promise<string> {
 const wanted = collectAssetUrls(html, origin);
 if (!wanted.length) return html;
 const groups = new Map<string, string[]>();
 for (const u of wanted) { const k = variantKey(u); const g = groups.get(k); if (g) g.push(u); else groups.set(k, [u]); }
 const map = new Map<string, string>();
 const pending: string[][] = [];
 for (const variants of groups.values()) {
  const known = cache.get(variantKey(variants[0]));
  if (known) { for (const v of variants) map.set(v, known); } else pending.push(variants);
 }
 for (let i = 0; i < pending.length; i += 4) {
  const done = await Promise.all(pending.slice(i, i + 4).map(async (variants) => ({ variants, r: await take(pickVariant(variants)) })));
  for (const { variants, r } of done) {
   if (!r) continue; // left pointing at the source; the backfill script reports and retries
   cache.set(variantKey(variants[0]), r.url);
   for (const v of variants) map.set(v, r.url);
  }
 }
 return rewritePageUrls(html, map, origin);
}

/**
 * BACKFILL for stores captured before rehosting lived in the crawl: re-host every theme asset a
 * store's stored pages refer to, and rewrite the pages to point at our copies. `dryRun` reports
 * what would be taken without writing anything. New captures never need this.
 */
export async function rehostThemeAssetsForStore(
 slug: string,
 opts: { dryRun?: boolean; max?: number; concurrency?: number; budgetMs?: number; onProgress?: (msg: string) => void } = {},
): Promise<RehostResult> {
 // No practical cap by default. A cap of 400 (a leftover from the budgeted import step that no longer
 // exists) skipped the same tail of files on EVERY pass of a 60-page store — the run reported success,
 // the summary said "(capped to 400)" in a line no one was reading, and 17 product photos stayed on
 // Shopify indefinitely. Callers that genuinely need a bound pass one.
 const { dryRun = false, max = 100_000, concurrency = 4, budgetMs = 0, onProgress } = opts;
 const startedAt = Date.now();
 const { listCapturePaths, getCapturePage, rewriteCapturePage, getCaptureOrigin } = await import("./site-capture-db.ts");

 const paths = await listCapturePaths(slug);
 const origin = await getCaptureOrigin(slug).catch(() => null);
 // ONE listing for the whole store, instead of one call per asset. montrose-edit has 8,213 assets
 // and spent 31 minutes of every fleet run asking Blob "do I have this?" — 8,213 times, four at a
 // time — and being told yes. See loadBlobIndex.
 const blobIndex = await loadBlobIndex(slug);
 // Files her own site has already told us are gone. shop-vintage-charm has 704 of them and spent
 // ~23 minutes of every run rediscovering it. See dead-assets.ts.
 const deadAssets = await knownDeadAssets(slug);
 onProgress?.(`already on our storage: ${blobIndex.size}${deadAssets.size ? ` · known missing on her site: ${deadAssets.size}` : ""}`);
 // The basenames of every product photo this store's items hold — see collectAssetUrls.
 const { neon } = await import("@neondatabase/serverless");
 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL!);
 const productFiles = new Set<string>();
 try {
  const rows = await sql`SELECT i.images::text t FROM items i JOIN sellers s ON s.id = i.seller_id WHERE s.slug = ${slug}` as { t: string }[];
  for (const r of rows) for (const m of r.t.matchAll(/\/([^/"?]+)\.(?:jpe?g|png|webp|gif|avif)(?:\?|")/gi)) productFiles.add(m[1]);
 } catch { /* no items yet (a store captured but not imported): take every image */ }
 const result: RehostResult = { pages: paths.length, candidates: 0, rehosted: 0, failed: 0, skipped: 0, bytes: 0, failures: [], incomplete: false };

 // One pass to gather, so an asset shared by 90 pages is fetched once rather than ninety times.
 const pageHtml = new Map<string, string>();
 const wanted = new Set<string>();
 for (const p of paths) {
  const html = await getCapturePage(slug, p).catch(() => null);
  if (!html) continue;
  pageHtml.set(p, html);
  for (const u of collectAssetUrls(html, origin, productFiles.size ? productFiles : undefined)) wanted.add(u);
 }
 // Group the ladder rungs of each file, then work in FILES: one fetch, one upload, every rung
 // repointed. `candidates` reports files, which is the number that means anything.
 const groups = new Map<string, string[]>();
 for (const u of wanted) { const k = variantKey(u); const g = groups.get(k); if (g) g.push(u); else groups.set(k, [u]); }
 const files = [...groups.values()].slice(0, max);
 result.candidates = groups.size;
 result.skipped = Math.max(0, groups.size - files.length);
 onProgress?.(`${slug}: ${paths.length} pages, ${groups.size} distinct files (${wanted.size} urls)${result.skipped ? ` (capped to ${max})` : ""}`);
 if (dryRun) return result;

 const map = new Map<string, string>();
 let taken = 0;
 for (let i = 0; i < files.length; i += concurrency) {
  // Inside an import this runs in the same serverless invocation as the crawl, which already
  // spends 180s of the 300s limit. Stop cleanly at the budget and rewrite what WAS taken — the
  // sweeper cron finishes the rest, exactly as it finishes a paused crawl.
  if (budgetMs && Date.now() - startedAt > budgetMs) break;
  const batch = files.slice(i, i + concurrency);
  taken += batch.length;
  const done = await Promise.all(batch.map(async (variants) => ({ variants, r: await rehostAsset(pickVariant(variants), slug, blobIndex, deadAssets) })));
  for (const { variants, r } of done) {
   if (r) { for (const v of variants) map.set(v, r.url); result.rehosted++; result.bytes += r.bytes; }
   else { result.failed++; if (result.failures.length < 8) result.failures.push(variants[0].slice(0, 110)); }
  }
 }
 result.incomplete = taken < files.length || result.skipped > 0 || result.failed > 0;
 if (!map.size) return result;

 for (const [p, html] of pageHtml) {
  const next = rewritePageUrls(html, map, origin);
  if (next !== html) await rewriteCapturePage(slug, p, next);
 }
 onProgress?.(`${slug}: rehosted ${result.rehosted}, failed ${result.failed}, ${(result.bytes / 1024).toFixed(0)} KB`);
 return result;
}

/** Test seam for the rewrite. */
export const rewriteAllForTest = rewriteAll;
