// HER PAGES, AS THE PANEL SHOWS THEM AND THE SERVE PATH TREATS THEM.
//
// Three things she can do to a captured page, and what each one means:
//  · RENAME — the page's title and its label in the menu. Never its address: a URL that changes is a
//    URL that 404s for everyone holding it, which is why there is no redirects table anywhere here.
//  · HIDE — shoppers get a plain "Page not found" and every menu link to it disappears. The page
//    itself is untouched, so Show puts it back exactly as it was. The same choice Step 2 made for
//    sections: hide is reversible, delete is a second, deliberate action.
//  · ADD — a new page in her own header and footer, with a starter text block in the middle.
//
// Sparse: no row means "as captured". A store nobody has touched has no rows at all, and everything
// below returns the page list the capture already implies.
//
// Pure. The database is pages-db.ts and the HTTP is the route; nothing here reads either.
import * as cheerio from "cheerio";
import { newBlockHtml } from "../site-capture.ts";
import { linkTargets, normalizePath } from "../capture-links.ts";
import { borrowChrome } from "./borrow-chrome.ts";
import { normalizeMenuHref, type MenuItem } from "./menus.ts";

export type PageKind = "captured" | "added";
export type PageRow = { path: string; title: string | null; navLabel: string | null; hidden: boolean; kind: PageKind };

export const PAGE_LIMITS = { title: 120, navLabel: 60, path: 300 } as const;

/**
 * Pages that may never be hidden or deleted, and why — said in her words, because a control that
 * silently does nothing is worse than one that explains itself.
 *
 * The cart is here for a blunt reason: hiding it takes out checkout. Home is the address her domain
 * resolves to. The product template is one design with a copy per piece, not a page.
 */
export function removalRefusal(path: string, opts: { productTemplate?: string | null } = {}): string | null {
 const p = normalizePath(path) ?? path;
 if (p === "/" || p === "") return "Your home page is the first thing shoppers see — it can’t be hidden.";
 if (/^\/cart$/.test(p)) return "Your cart page is how shoppers check out — hiding it would stop them buying.";
 if (/^\/search$/.test(p)) return "Your search page answers your shop’s own search box.";
 if (opts.productTemplate && path === opts.productTemplate) return "This is the design every product page uses, not a page of its own.";
 if (/^\/products\//.test(p)) return "This is the design every product page uses, not a page of its own.";
 return null;
}

export function canHidePath(path: string, opts: { productTemplate?: string | null } = {}): boolean {
 return removalRefusal(path, opts) === null;
}

/** A page's name when nothing has renamed it: the last part of its address, in words. */
export function labelFromPath(path: string): string {
 if (path === "/" || path === "") return "Home";
 const seg = path.split("/").filter(Boolean).pop() || path;
 return seg.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * What the panel calls this page: her own name for it, else what her MENU calls it, else its address.
 *
 * The menu matters here. Her shop's own words for these pages are "Our Shoes" and "Shoe Blog"; the
 * addresses behind them are /collections/all and /blogs/news, which derive to "All" and "News" — so a
 * list built from addresses alone names her pages things she has never called them.
 */
export function pageLabel(path: string, row?: Pick<PageRow, "title" | "navLabel"> | null, fromMenu?: string): string {
 return (row?.navLabel || row?.title || fromMenu || "").trim() || labelFromPath(path);
}

export type PageGroup = "menu" | "collections" | "other" | "unlinked" | "product";
export type PageEntry = {
 path: string; label: string; title: string | null; navLabel: string | null;
 hidden: boolean; kind: PageKind; group: PageGroup; inMenu: boolean; canHide: boolean; refusal: string | null;
};

/**
 * The page list the panel renders: her menu first, in menu order, then the rest.
 *
 * Product pages are hundreds of copies of one design, so they are represented by the template alone —
 * the same rule the page strip has always followed.
 */
export function mergePageList(input: {
 paths: readonly string[];
 rows: ReadonlyMap<string, PageRow>;
 menu: { items: MenuItem[] } | null;
 unlinked?: readonly string[];
 productTemplate?: string | null;
}): PageEntry[] {
 const unlinked = new Set(input.unlinked || []);
 const menuOrder = new Map<string, number>();
 const menuLabel = new Map<string, string>();
 (input.menu?.items || []).forEach((it, i) => {
  if (!it.href.startsWith("/")) return;
  menuOrder.set(it.href, i);
  if (it.label.trim()) menuLabel.set(it.href, it.label.trim());
 });

 const listable = input.paths.filter((p) => !/^\/products\//.test(p));
 const entry = (path: string, group: PageGroup): PageEntry => {
  const row = input.rows.get(path) ?? null;
  const refusal = removalRefusal(path, { productTemplate: input.productTemplate });
  const key = normalizeMenuHref(path) ?? path;
  return {
   path, label: pageLabel(path, row, menuLabel.get(key)), title: row?.title ?? null, navLabel: row?.navLabel ?? null,
   hidden: !!row?.hidden, kind: row?.kind ?? "captured", group,
   inMenu: menuOrder.has(key), canHide: refusal === null, refusal,
  };
 };

 const out: PageEntry[] = [];
 const placed = new Set<string>();
 // In her menu, in her order — the whole point of the panel.
 for (const [href] of [...menuOrder.entries()].sort((a, b) => a[1] - b[1])) {
  const match = listable.find((p) => (normalizeMenuHref(p) ?? p) === href);
  if (match && !placed.has(match)) { out.push(entry(match, "menu")); placed.add(match); }
 }
 for (const p of listable) {
  if (placed.has(p)) continue;
  placed.add(p);
  out.push(entry(p, unlinked.has(p) ? "unlinked" : /^\/collections\//.test(p) ? "collections" : "other"));
 }
 if (input.productTemplate) out.push(entry(input.productTemplate, "product"));
 return out;
}

/**
 * How many links on the pages we checked still point at this one.
 *
 * Hiding a page that her footer, a banner or a collection tile links to leaves those links pointing
 * at a "Page not found" — so the confirmation says how many there are first. Shoppers still get a
 * clean 404 rather than a broken layout; this is so she is not surprised by it.
 */
export function countLinksTo(htmls: readonly string[], path: string, origin?: string | null): number {
 return countLinksByPath(htmls, origin).get(normalizeMenuHref(path) ?? path) ?? 0;
}

/** The same count for every page at once — the page list needs all of them, and this reads each
 *  source page once rather than once per page in the list. */
export function countLinksByPath(htmls: readonly string[], origin?: string | null): Map<string, number> {
 const out = new Map<string, number>();
 for (const html of htmls) {
  for (const t of linkTargets(html, origin)) {
   const key = normalizeMenuHref(t) ?? t;
   out.set(key, (out.get(key) ?? 0) + 1);
  }
 }
 return out;
}

// ── Adding a page ────────────────────────────────────────────────────────────────────────────────

export type Platform = "shopify" | "squarespace";

function slugify(title: string): string {
 return (title || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "page";
}

/**
 * Where a page she adds lives, in the shape her own platform uses — so it sits among her other pages
 * rather than announcing itself as ours. A collision with anything already captured takes a suffix,
 * because two rows cannot share an address and overwriting one of her pages is unthinkable.
 */
export function addedPagePath(title: string, platform: Platform, taken: readonly string[]): string {
 const base = slugify(title);
 const at = (s: string) => (platform === "squarespace" ? `/${s}` : `/pages/${s}`);
 const used = new Set(taken.map((p) => (normalizePath(p) ?? p).toLowerCase()));
 let candidate = at(base);
 for (let n = 2; used.has(candidate.toLowerCase()) && n < 100; n++) candidate = at(`${base}-${n}`);
 return candidate;
}

/**
 * The page to borrow her chrome from: the simplest page of hers we hold.
 *
 * The shortest ordinary page, because a long one is a long one for a reason — a homepage full of
 * carousels, or a collection page whose markup is mostly grid. Anything with commerce in it is
 * skipped outright. The home page is the last resort, never the first choice.
 */
export function pickBlankTemplatePath(paths: readonly string[], platform: Platform): string | null {
 const skip = /^\/(cart|search|checkout|account)\b|^\/products\/|^\/collections\/|^\/shop(\/|$)|^\/__vya\/|^__/;
 const prefer = platform === "squarespace" ? (p: string) => !skip.test(p) && p !== "/" : (p: string) => /^\/pages\//.test(p);
 const pool = paths.filter(prefer);
 const fallback = paths.filter((p) => p !== "/" && !skip.test(p));
 const best = [...(pool.length ? pool : fallback)].sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
 return best ?? (paths.includes("/") ? "/" : null);
}

/** The page's name, in the tab and in anything that shares it. */
export function applyPageTitle($: cheerio.CheerioAPI, title: string): void {
 const t = title.slice(0, PAGE_LIMITS.title);
 if ($("title").length) $("title").first().text(t);
 else if ($("head").length) $("head").first().prepend(`<title></title>`), $("title").first().text(t);
 const og = $('meta[property="og:title"]');
 if (og.length) og.attr("content", t);
}

/**
 * A new page: her header, her footer, her fonts and colours, and one text block to start from.
 *
 * Everything the borrowed page said about ITSELF is removed. A canonical link or an og:url left
 * behind would tell search engines this new page is a copy of the one it was built from, and the old
 * page's structured data would describe the wrong thing entirely.
 */
export function buildBlankPage(templateHtml: string, opts: { title: string }): string {
 const $ = cheerio.load(templateHtml || "<html><head></head><body></body></html>");
 borrowChrome($, newBlockHtml({ new: "text", text: `${opts.title}\nAdd your text here.` }));
 applyPageTitle($, opts.title);
 $('link[rel="canonical"], meta[property="og:url"], script[type="application/ld+json"]').remove();
 $('meta[name="description"], meta[property="og:description"]').remove();
 return $.html();
}
