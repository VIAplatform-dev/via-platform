// Product grids she added, filled from LIVE inventory at serve time.
//
// A grid is stored as an empty marker (grid-config.ts). On every request — every hosted page type:
// home, pages, collections, search, the product route and the cart page — each marker is filled with
// the pieces of its collection right now, in her theme's own card when a kit exists (grid-kit.ts) and
// in the plain card otherwise. The editor gets the same render, so what she arranges is what shoppers get.
//
// Pure: cheerio in, cheerio out. Loading items and the kit happens in serve.ts.
import * as cheerio from "cheerio";
import type { Element as DomElement } from "domhandler";
import { renderKitGrid, liveGridHtml, type CollectionCardItem, type HrefFor } from "../site-capture.ts";
import { parseGridConfig, isGridId, newGridId, ratioCss, ratioPercent, type GridConfig } from "./grid-config.ts";
import type { GridKit } from "./grid-kit.ts";

export type GridBlock = { el: DomElement; id: string; config: GridConfig };
export type RenderedKind = "theme" | "simple";

/** Shown in the editor for a grid whose collection has nothing in it. Shoppers get nothing at all. */
export const EMPTY_NOTE_HTML = `<div data-vya-grid-note="1" style="padding:48px 24px;text-align:center;opacity:.6;font:inherit">No pieces in this collection yet</div>`;

/** Cheap guard so a page without grids is never parsed for them. */
export function hasGridBlocks(html: string | null | undefined): boolean {
 return !!html && html.indexOf("data-vya-grid") !== -1;
}

/** Every grid marker on the page, with its settings validated against her collections. */
export function collectGridBlocks($: cheerio.CheerioAPI, collections: readonly string[] | null): GridBlock[] {
 return ($('[data-vya-newtype="products"][data-vya-grid]').toArray() as DomElement[]).map((el) => {
  let id = $(el).attr("data-vya-grid-id");
  if (!isGridId(id)) { id = newGridId(); $(el).attr("data-vya-grid-id", id); }
  return { el, id, config: parseGridConfig($(el).attr("data-vya-grid"), collections) };
 });
}

/**
 * The grid's own layout rules, every selector scoped to this grid's id so two grids on a page (or a
 * theme grid beside it) are never touched. Columns override the theme's flex widths; the image shape
 * uses the theme's own padding-ratio variable when the card has one (Dawn family), and otherwise
 * gives each photo wrapper an aspect-ratio.
 */
export function gridScopedCss(id: string, c: GridConfig, opts: { theme: boolean; ratioVar: boolean }): string {
 const root = `[data-vya-grid-id="${id}"]`;
 const g = `${root} [data-vya-kit-grid]`;
 const rules = [
  `${g}{display:grid!important;grid-template-columns:repeat(${c.cols},minmax(0,1fr))!important}`,
  `${g}>*{width:auto!important;max-width:none!important;min-width:0!important;flex:none!important;grid-column:auto!important}`,
  `@media (max-width:749px){${g}{grid-template-columns:repeat(${c.mcols},minmax(0,1fr))!important}}`,
  // renderThemeCard anchors its sold badge with a head rule, which a fragment has no head for.
  `${root} [data-vya-sold-host]{position:relative}`,
 ];
 const ratio = ratioCss(c.ratio);
 if (ratio) {
  if (!opts.theme) rules.push(`${g} img{aspect-ratio:${ratio}!important;object-fit:cover!important;height:auto!important}`);
  else if (opts.ratioVar) rules.push(`${g} [style*="--ratio-percent"]{--ratio-percent:${ratioPercent(c.ratio)}%!important}`, `${g} img{object-fit:cover!important}`);
  else rules.push(
   `${g} [data-vya-ratio-host]{aspect-ratio:${ratio}!important;height:auto!important;padding:0!important;position:relative!important;overflow:hidden!important}`,
   `${g} [data-vya-ratio-host] img{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;object-fit:cover!important}`,
  );
 }
 return rules.join("");
}

function simpleGridHtml(items: CollectionCardItem[], hrefFor: HrefFor): string {
 // The plain card, at a page width of its own — it has no theme wrapper to borrow one from.
 const grid = liveGridHtml(items, hrefFor).replace('<div data-vya-collection="1"', '<div data-vya-collection="1" data-vya-kit-grid="1"');
 return `<div data-vya-simple-grid="1" style="max-width:1200px;margin:0 auto;padding:24px 20px;box-sizing:border-box">${grid}</div>`;
}

/** What goes inside one marker. Also what the editor's preview returns, so the two cannot differ. */
export function gridBlockInnerHtml(
 config: GridConfig,
 id: string,
 opts: { kit: GridKit | null; items: CollectionCardItem[]; hrefFor: HrefFor; keepQuickAdd?: boolean; editor?: boolean },
): { html: string; kind: RenderedKind | null; empty: boolean } {
 const shown = opts.items.slice(0, config.count);
 if (!shown.length) return { html: opts.editor ? EMPTY_NOTE_HTML : "", kind: null, empty: true };
 const wantTheme = !!opts.kit && config.card === "theme";
 const ratioVar = wantTheme && opts.kit!.cardHtml.includes("--ratio-percent");
 let body = wantTheme ? renderKitGrid(opts.kit!, shown, opts.hrefFor, { keepQuickAdd: opts.keepQuickAdd, markRatioHost: config.ratio !== "theme" && !ratioVar }) : "";
 // fillGrid falls back to the plain grid itself when the kit's card can't be used, dropping our marker.
 const theme = !!body && body.includes("data-vya-kit-grid");
 if (!theme) body = simpleGridHtml(shown, opts.hrefFor);
 const css = gridScopedCss(id, config, { theme, ratioVar: theme && ratioVar });
 return { html: `<style data-vya-grid-style="${id}">${css}</style>${body}`, kind: theme ? "theme" : "simple", empty: false };
}

/** The kit's stylesheets, minus any the page already carries. */
export function kitCssForPage($: cheerio.CheerioAPI, kit: GridKit): string {
 const have = new Set(($("style").toArray() as DomElement[]).map((s) => ($(s).html() || "").trim().slice(0, 240)));
 return kit.css.filter((c) => !have.has(c.trim().slice(0, 240))).join("\n");
}

/**
 * Fill every grid marker on the page. Items per collection come from `itemsFor` (already capped by
 * nothing; each grid takes its own count). The kit's CSS is added to <head> once, and only when a
 * theme-card grid actually rendered.
 */
export function injectGridBlocks(
 $: cheerio.CheerioAPI,
 opts: { blocks: GridBlock[]; kit: GridKit | null; itemsFor: (collection: string) => CollectionCardItem[]; hrefFor: HrefFor; keepQuickAdd?: boolean; editor?: boolean },
): { rendered: number; theme: number } {
 let rendered = 0, theme = 0;
 for (const b of opts.blocks) {
  const r = gridBlockInnerHtml(b.config, b.id, { kit: opts.kit, items: opts.itemsFor(b.config.collection), hrefFor: opts.hrefFor, keepQuickAdd: opts.keepQuickAdd, editor: opts.editor });
  $(b.el).html(r.html);
  if (r.kind) rendered++;
  if (r.kind === "theme") theme++;
 }
 if (theme && opts.kit && !$("style[data-vya-kit-css]").length) {
  const css = kitCssForPage($, opts.kit);
  if (css) {
   const tag = `<style data-vya-kit-css="1">${css.replace(/<\//g, "<\\/")}</style>`;
   if ($("head").length) $("head").first().append(tag); else $.root().prepend(tag);
  }
 }
 return { rendered, theme };
}
