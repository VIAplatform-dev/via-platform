// The `sections` array of an editor save, read into what applySectionEdits accepts.
//
// Every entry is bounded here, before anything touches her page:
//  · a number                         → that section, untouched
//  · {new: <type>, text?, href?, html?} → a new block (html sanitised later)
//  · {new: "products", grid?, gridId?} → a product grid, stored as its marker from VALIDATED settings;
//    settings/id may also be read off the marker's opening tag in `html` (an older client)
//  · {sec, html?, hidden?, grid?}      → her own section changed, hidden/shown, or a grid's settings
import * as cheerio from "cheerio";
import { NEW_BLOCK_TYPES, type NewBlock, type EditedSection } from "../site-capture.ts";
import { parseGridConfig, isGridId, newGridId } from "./grid-config.ts";

export type SectionEntry = number | NewBlock | EditedSection;

const VALID_NEW = new Set<string>(NEW_BLOCK_TYPES);

/** The marker attributes off the opening tag of a grid block's markup, never its cards. */
function markerAttrs(html: unknown): { grid?: string; id?: string } {
 if (typeof html !== "string") return {};
 const open = html.slice(0, 8000).match(/^\s*<div\b[^>]*>/i)?.[0];
 if (!open) return {};
 const $ = cheerio.load(`${open}</div>`, null, false);
 const el = $("div").first();
 return { grid: el.attr("data-vya-grid"), id: el.attr("data-vya-grid-id") };
}

/** Does this payload carry grid settings (so her collection list is needed to validate them)? */
export function payloadHasGrids(raw: unknown): boolean {
 return Array.isArray(raw) && raw.some((e) => !!e && typeof e === "object" && ((e as { new?: unknown }).new === "products" || (e as { grid?: unknown }).grid !== undefined));
}

export function parseSectionEntries(raw: unknown, collections: readonly string[] | null): SectionEntry[] {
 if (!Array.isArray(raw)) return [];
 return raw.map((e): SectionEntry | null => {
  if (typeof e === "number") return Number.isInteger(e) && e >= 0 ? e : null;
  const o = e as { new?: unknown; sec?: unknown; text?: unknown; href?: unknown; html?: unknown; hidden?: unknown; grid?: unknown; gridId?: unknown } | null;
  if (!o || typeof o !== "object") return null;
  if (o.new === "products") {
   const fromTag = markerAttrs(o.html);
   const grid = parseGridConfig(o.grid && typeof o.grid === "object" ? o.grid : fromTag.grid, collections);
   const id = isGridId(o.gridId) ? o.gridId : isGridId(fromTag.id) ? fromTag.id : newGridId();
   return { new: "products", grid, gridId: id };
  }
  if (typeof o.new === "string" && VALID_NEW.has(o.new)) {
   return { new: o.new as NewBlock["new"], text: typeof o.text === "string" ? o.text : undefined, href: typeof o.href === "string" ? o.href : undefined, html: typeof o.html === "string" ? o.html : undefined };
  }
  if (typeof o.sec === "number" && Number.isInteger(o.sec) && o.sec >= 0) {
   const entry: EditedSection = { sec: o.sec };
   // A section is a section, not a place to post a megabyte.
   if (typeof o.html === "string") entry.html = o.html.slice(0, 400_000);
   if (typeof o.hidden === "boolean") entry.hidden = o.hidden;
   if (o.grid && typeof o.grid === "object") entry.grid = parseGridConfig(o.grid, collections);
   // Nothing about it changed after all: the stored section, by index.
   if (entry.html === undefined && entry.hidden === undefined && entry.grid === undefined) return o.sec;
   return entry;
  }
  return null;
 }).filter((e): e is SectionEntry => e !== null);
}

/** Does this save add or change a product grid (so the store's grid kit must be stored)? */
export function entriesTouchGrids(entries: readonly SectionEntry[]): boolean {
 return entries.some((e) => typeof e === "object" && (("new" in e && e.new === "products") || ("sec" in e && e.grid !== undefined)));
}
