// A product grid she added to her imported site — its settings, bounded.
//
// The grid lives in her page as an EMPTY MARKER carrying these settings, never as cards:
//   <div data-vya-block="1" data-vya-newtype="products" data-vya-grid-id="g_x7k2" data-vya-grid="{…}"></div>
// Cards are filled in from live inventory on every request (inject-grid-blocks.ts), so a piece that
// sells or is repriced changes on her site without anyone saving anything.
//
// Everything read back from a page goes through parseGridConfig. A value outside the bounds falls
// back to the default — a shopper's page never errors because a setting was hand-edited or stale.
import { MAX_FEATURED } from "../storefront-blocks.ts";

export const GRID_RATIOS = ["theme", "portrait", "square", "landscape"] as const;
export const GRID_CARDS = ["theme", "simple"] as const;
export type GridRatio = (typeof GRID_RATIOS)[number];
export type GridCard = (typeof GRID_CARDS)[number];

export type GridConfig = {
 v: 1;
 /** One of her collection slugs, or "all" for every live piece. */
 collection: string;
 count: number;
 cols: number;
 mcols: number;
 ratio: GridRatio;
 card: GridCard;
};

/** The Studio's own cap on a product section (MAX_FEATURED), so the two builders agree. */
export const GRID_BOUNDS = { count: { min: 1, max: MAX_FEATURED }, cols: { min: 1, max: 6 }, mcols: { min: 1, max: 2 } } as const;

export const GRID_DEFAULTS: GridConfig = { v: 1, collection: "all", count: 8, cols: 4, mcols: 2, ratio: "theme", card: "theme" };

// A collection slug as VYA writes them (slugify of a title) — letters, digits, hyphens, underscores.
const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{0,119}$/i;

function int(v: unknown, fallback: number, min: number, max: number): number {
 const n = typeof v === "string" && v.trim() !== "" ? Number(v) : typeof v === "number" ? v : NaN;
 if (!Number.isFinite(n)) return fallback;
 return Math.max(min, Math.min(max, Math.round(n)));
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
 return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/**
 * Settings from anywhere — the marker attribute (a JSON string), a save payload, a query string.
 *
 * `collections` is her collection slugs when known. When given, a collection that is not hers becomes
 * "all". When null (not looked up), any well-formed handle is kept and checked again where it is used.
 */
export function parseGridConfig(raw: unknown, collections: readonly string[] | null = null): GridConfig {
 let o: Record<string, unknown> = {};
 if (typeof raw === "string") {
  try { const p = JSON.parse(raw); if (p && typeof p === "object" && !Array.isArray(p)) o = p as Record<string, unknown>; } catch { /* allow-swallow: an unreadable setting is the default, never an error on her page */ }
 } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
  o = raw as Record<string, unknown>;
 }
 const c = typeof o.collection === "string" ? o.collection.trim() : "";
 let collection = "all";
 if (c && c !== "all" && HANDLE_RE.test(c)) {
  if (!collections || collections.includes(c)) collection = c;
 }
 return {
  v: 1,
  collection,
  count: int(o.count, GRID_DEFAULTS.count, GRID_BOUNDS.count.min, GRID_BOUNDS.count.max),
  cols: int(o.cols, GRID_DEFAULTS.cols, GRID_BOUNDS.cols.min, GRID_BOUNDS.cols.max),
  mcols: int(o.mcols, GRID_DEFAULTS.mcols, GRID_BOUNDS.mcols.min, GRID_BOUNDS.mcols.max),
  ratio: oneOf(o.ratio, GRID_RATIOS, GRID_DEFAULTS.ratio),
  card: oneOf(o.card, GRID_CARDS, GRID_DEFAULTS.card),
 };
}

/** Did the settings name a collection at all? A brand-new grid does not, and gets her menu's first. */
export function namesCollection(raw: unknown): boolean {
 let o: unknown = raw;
 if (typeof raw === "string") { try { o = JSON.parse(raw); } catch { return false; } }
 return !!o && typeof o === "object" && typeof (o as Record<string, unknown>).collection === "string" && ((o as Record<string, unknown>).collection as string).trim() !== "";
}

const GRID_ID_RE = /^g_[a-z0-9]{4,16}$/;
export function isGridId(v: unknown): v is string {
 return typeof v === "string" && GRID_ID_RE.test(v);
}

/** A fresh grid id. It scopes the grid's own CSS, so two grids on one page must never share one. */
export function newGridId(rand: () => number = Math.random): string {
 let s = "";
 while (s.length < 8) s += Math.floor(rand() * 36).toString(36);
 return `g_${s.slice(0, 8)}`;
}

function escAttr(s: string): string {
 return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The marker stored in her page. Nothing else about a grid is ever stored there. */
export function gridMarkerHtml(id: string, config: GridConfig): string {
 const safeId = isGridId(id) ? id : newGridId();
 return `<div data-vya-block="1" data-vya-newtype="products" data-vya-grid-id="${safeId}" data-vya-grid="${escAttr(JSON.stringify(parseGridConfig(config)))}"></div>`;
}

/** CSS aspect-ratio for an image shape; null keeps the theme's own. */
export function ratioCss(r: GridRatio): string | null {
 return r === "portrait" ? "3 / 4" : r === "square" ? "1 / 1" : r === "landscape" ? "4 / 3" : null;
}

/** The same shape as the theme's padding-ratio variable (`--ratio-percent`, height as % of width). */
export function ratioPercent(r: GridRatio): number | null {
 return r === "portrait" ? 133.33 : r === "square" ? 100 : r === "landscape" ? 75 : null;
}

/** The first of her collections her page links to — what a new grid shows before she picks one. */
export function firstLinkedCollection(html: string, collections: readonly string[]): string {
 const mine = new Set(collections);
 const re = /\/collections\/([a-z0-9][a-z0-9_-]*)/gi;
 for (let m = re.exec(html); m; m = re.exec(html)) {
  if (m[1] !== "all" && mine.has(m[1])) return m[1];
 }
 return "all";
}
