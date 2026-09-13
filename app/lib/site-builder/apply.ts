// THE BUILDER'S ONE PASS over a hosted page.
//
// Every transform the imported-site builder adds at serve time runs here, on ONE parse of the page:
// product grids now (Step 2); the menu, page settings and shared header/footer later (Steps 3–4). The
// serve route already parses a megabyte page several times, so no builder transform may add its own.
//
// Pure apart from the loaders it is handed: serve.ts supplies them from the database, tests supply
// fixtures. A page with nothing of the builder's on it is returned untouched and never parsed.
import * as cheerio from "cheerio";
import type { CollectionCardItem, HrefFor } from "../site-capture.ts";
import type { GridKit } from "./grid-kit.ts";
import { collectGridBlocks, hasGridBlocks, injectGridBlocks } from "./inject-grid-blocks.ts";
import { applyMenu, type StoredMenu } from "./menus.ts";
import { applyPageTitle } from "./pages.ts";

export type SiteBuilderContext = {
 kit?: GridKit | null;
 /** Her collection slugs; a grid naming anything else shows all her pieces. */
 collections?: readonly string[] | null;
 /** Live pieces for one collection ("all" = every live piece). Called once per distinct collection. */
 loadItems?: (collection: string) => Promise<CollectionCardItem[]>;
 hrefFor?: HrefFor;
 keepQuickAdd?: boolean;
 /** The seller's editor: an empty grid says so instead of disappearing. */
 editor?: boolean;
 // ── Step 3 ──
 /** Her menu order, when she has set one. Applied to every copy the theme ships (menus.ts). */
 menu?: StoredMenu | null;
 /** Pages she has hidden: every menu link to one of them goes. */
 hiddenPaths?: ReadonlySet<string>;
 /** Pages she has renamed, by path: their menu items wear the new name. */
 menuLabels?: ReadonlyMap<string, string>;
 /** Her name for this page, when she has renamed it. */
 pageTitle?: string | null;
};

/** Does this request carry anything the builder renders at serve time? */
export function needsSiteBuilder(html: string | null | undefined, ctx?: Partial<SiteBuilderContext>): boolean {
 return hasGridBlocks(html) || !!ctx?.menu || !!ctx?.hiddenPaths?.size || !!ctx?.menuLabels?.size || !!ctx?.pageTitle;
}

export async function applySiteBuilder(html: string, ctx: SiteBuilderContext): Promise<string> {
 const grids = hasGridBlocks(html) && !!ctx.loadItems && !!ctx.hrefFor;
 if (!needsSiteBuilder(html, ctx) || (!grids && !ctx.menu && !ctx.hiddenPaths?.size && !ctx.menuLabels?.size && !ctx.pageTitle)) return html;
 const $ = cheerio.load(html);
 let touched = false;

 if (grids) {
  const blocks = collectGridBlocks($, ctx.collections ?? null);
  if (blocks.length) {
   const lists = new Map<string, CollectionCardItem[]>();
   await Promise.all([...new Set(blocks.map((b) => b.config.collection))].map(async (c) => {
    lists.set(c, await ctx.loadItems!(c).catch(() => [] as CollectionCardItem[])); /* allow-swallow: one collection failing empties its grid, never the page */
   }));
   injectGridBlocks($, { blocks, kit: ctx.kit ?? null, itemsFor: (c) => lists.get(c) || [], hrefFor: ctx.hrefFor!, keepQuickAdd: ctx.keepQuickAdd, editor: ctx.editor });
   touched = true;
  }
 }

 // Her menu order, on every copy of the menu this page carries — and, with or without an order of her
 // own, no link left pointing at a page she has hidden.
 if (ctx.menu || ctx.hiddenPaths?.size || ctx.menuLabels?.size) {
  if (applyMenu($, { menu: ctx.menu, hidden: ctx.hiddenPaths, labels: ctx.menuLabels }).changed) touched = true;
 }
 if (ctx.pageTitle) { applyPageTitle($, ctx.pageTitle); touched = true; }

 return touched ? $.html() : html;
}
