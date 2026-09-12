// The GRID KIT: her own product card, taken from her own collection page, so a grid she adds to any
// page looks like the grids her theme already draws.
//
// Derived from captured pages, never invented. For each candidate page (her shop-all page first) the
// largest real product grid is taken apart — one card, the grid container, the wrappers that give it
// its width and colour scheme, and the stylesheets that page has and her home page lacks — and then
// TESTED: one made-up piece is rendered through it, and the kit is refused if the template's own
// product name or price is still showing (finding F8: a card can look usable and still not be), if
// the grid is a carousel, or if each slot is styled on its own (Squarespace Fluid Engine). No page
// yields a kit → null, and grids use the plain card, which still takes her fonts.
//
// Pure: pages in, kit out. Storage and page loading live in grid-kit-store.ts.
import * as cheerio from "cheerio";
import { gridKitCandidates, renderKitGrid, type KitNode, type CollectionCardItem, type GridKitCandidate } from "../site-capture.ts";

export type GridPlatform = "shopify" | "squarespace" | "other";

export type GridKit = {
 v: 1;
 sourcePath: string;
 platform: GridPlatform;
 /** One card, with no <style>/<link>/<script> — fillGrid's clone source. */
 cardHtml: string;
 /** The grid container, children removed. */
 gridEl: KitNode;
 /** Wrappers from the section root down to the grid's parent (keeps .page-width, colour scheme). */
 shell: KitNode[];
 /** <style> blocks on the source page that her home page lacks, in order, capped. */
 css: string[];
 price: { decimals: number; showCode: boolean };
 labels: { add?: string; sold?: string };
};

/** Cap on the stylesheets a kit carries — every page with a grid pays for them once. */
export const KIT_CSS_CAP = 300_000;
/** How many collection pages are tried before the home page. Pages are up to a few MB each (F1). */
export const KIT_MAX_PAGES = 5;

/** The made-up piece a kit must render correctly before it is trusted. Its name and price appear on no
 *  real store, so anything left of the template's own is plainly visible next to it. */
export const PROBE_ITEM: CollectionCardItem = {
 id: "vya-kit-probe", title: "Vya Kit Probe Piece", priceCents: 987654, currency: "USD",
 images: ["https://vya.invalid/kit-probe.jpg"], sourceId: "vya-kit-probe", available: true,
};

export function detectPlatform(html: string | null | undefined): GridPlatform {
 if (!html) return "other";
 if (/static1\.squarespace\.com|SQUARESPACE_CONTEXT|squarespace-cdn\.com/.test(html)) return "squarespace";
 if (/cdn\.shopify\.com|Shopify\.theme|shopify-section/.test(html)) return "shopify";
 return "other";
}

/** The pages a kit is looked for on, best first: her shop-all page, her other collections, then home. */
export function kitSourcePaths(paths: readonly string[], platform: GridPlatform, max = KIT_MAX_PAGES): string[] {
 const have = new Set(paths);
 const shopify = ["/collections/all", ...paths.filter((p) => /^\/collections\/[^/]+$/.test(p) && p !== "/collections/all").sort()];
 const sqs = ["/shop", ...paths.filter((p) => /^\/shop\/[^/]+$/.test(p) && !/^\/shop\/p$/.test(p)).sort()];
 const order = platform === "squarespace" ? sqs : platform === "shopify" ? shopify : [...shopify, ...sqs];
 const picked = [...new Set(order)].filter((p) => have.has(p)).slice(0, max);
 if (have.has("/")) picked.push("/");
 return picked;
}

const STYLE_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
function styleTexts(html: string): string[] {
 const out: string[] = [];
 for (const m of html.matchAll(STYLE_RE)) { const t = m[1].trim(); if (t) out.push(t); }
 return out;
}

/** The stylesheets a page has that the home page doesn't — what a card from that page needs to look
 *  right anywhere else. Deduplicated, in document order, never over `cap` bytes in total. */
export function missingCss(pageHtml: string, homeHtml: string, cap = KIT_CSS_CAP): string[] {
 const home = new Set(styleTexts(homeHtml || ""));
 const out: string[] = [];
 const seen = new Set<string>();
 let size = 0;
 for (const t of styleTexts(pageHtml)) {
  if (home.has(t) || seen.has(t)) continue;
  seen.add(t);
  if (size + t.length > cap) continue;
  size += t.length;
  out.push(t);
 }
 return out;
}

function kitFrom(c: GridKitCandidate, page: { path: string; html: string }, homeHtml: string, platform: GridPlatform): GridKit {
 return {
  v: 1, sourcePath: page.path, platform,
  cardHtml: c.cardHtml, gridEl: c.gridEl, shell: c.shell,
  css: page.path === "/" ? [] : missingCss(page.html, homeHtml),
  price: { decimals: /[.,]\d{2}\b/.test(c.templatePrice) ? 2 : 0, showCode: /\b[A-Z]{3}\b/.test(c.templatePrice) },
  labels: c.labels || {},
 };
}

/**
 * Render one made-up piece through the kit and check it is really the piece that shows.
 * Refused when: no card or more than one; the probe's name or photo is missing; or the template's own
 * product name or price survived substitution anywhere in the card.
 */
export function kitRendersCleanly(kit: GridKit, c: Pick<GridKitCandidate, "templateTitle" | "templatePrice">): boolean {
 const html = renderKitGrid(kit, [PROBE_ITEM], () => "/products/vya-kit-probe");
 if (!html) return false;
 const $ = cheerio.load(html, null, false);
 if ($("[data-vya-item]").length !== 1) return false;
 const text = $.root().text().replace(/\s+/g, " ");
 if (!text.includes(PROBE_ITEM.title)) return false;
 const probeImg = String((PROBE_ITEM.images as string[])[0]);
 if (!$("img").toArray().some((img) => Object.values((img as { attribs?: Record<string, string> }).attribs || {}).some((v) => String(v).includes(probeImg)))) return false;
 const title = (c.templateTitle || "").replace(/\s+/g, " ").trim();
 if (title.length >= 3 && text.includes(title)) return false;
 const price = (c.templatePrice || "").replace(/\s+/g, " ").trim();
 if (price && text.includes(price)) return false;
 return true;
}

/** The first trustworthy kit among these pages (already in preference order), or null. */
export function deriveGridKit(pages: { path: string; html: string }[], homeHtml: string, platform: GridPlatform = detectPlatform(homeHtml)): GridKit | null {
 for (const page of pages) {
  if (!page.html) continue;
  for (const c of gridKitCandidates(page.html)) {
   if (c.slider || c.individuallyStyled || !c.cardHtml) continue;
   const kit = kitFrom(c, page, homeHtml, platform);
   if (kitRendersCleanly(kit, c)) return kit;
  }
 }
 return null;
}

/** A stored kit, checked before use: an older shape or a truncated row renders the plain card instead. */
export function isGridKit(v: unknown): v is GridKit {
 const k = v as GridKit;
 return !!k && typeof k === "object" && k.v === 1
  && typeof k.cardHtml === "string" && k.cardHtml.length > 0 && k.cardHtml.length < 400_000
  && !!k.gridEl && typeof k.gridEl.tag === "string"
  && Array.isArray(k.shell) && k.shell.length <= 12 && k.shell.every((n) => n && typeof n.tag === "string")
  && Array.isArray(k.css) && k.css.every((s) => typeof s === "string");
}
