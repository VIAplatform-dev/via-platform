// The builder's serve-time pass, wired to the database. Every hosted page type calls this — the
// catch-all route (home, pages, collections, search), the product route and the cart page — so a grid
// she adds renders from live inventory wherever she put it, and her menu order reaches every one of
// them.
//
// Fails soft: any error returns the page as it was, with its grid markers empty (they take no space)
// and its menu exactly as captured.
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listCollections, listCollectionItemsForStorefront, getCollectionWithSyncState } from "@/app/lib/db/collections";
import { listStorefrontItems } from "@/app/lib/db/inventory";
import { storefrontAvailability } from "@/app/lib/unavailable-label";
import type { CollectionCardItem, HrefFor } from "@/app/lib/site-capture";
import { applySiteBuilder, needsSiteBuilder } from "./apply";
import { gridKitForServe } from "./grid-kit-store";
import { hasGridBlocks } from "./inject-grid-blocks";
import { hiddenPathsOf, loadStoreBuilderRows } from "./pages-db";
import type { StoredMenu } from "./menus";

type StorefrontItem = { id: string; title: string; priceCents: number | null; currency: string | null; images: unknown; sourceId?: string | null; status?: string; unavailableReason?: string | null; compareAtCents?: number | null };

/** The same card shape the serve route gives every live grid, so a piece looks and links the same. */
export function toCardItem(it: StorefrontItem): CollectionCardItem {
 return { id: it.id, title: it.title, priceCents: it.priceCents, currency: it.currency, images: it.images, sourceId: it.sourceId, ...storefrontAvailability(it), compareAtCents: it.compareAtCents };
}

/** Where a piece links, exactly as the serve route links it: her captured page when it has one. */
export function hrefForStore(slug: string, onStoreOrigin: boolean): HrefFor {
 const base = onStoreOrigin ? "" : `/site/${slug}`;
 return (it) => (it.sourceId ? `${base}/products/${it.sourceId}` : `/products/${it.id}`);
}

/** Live pieces for one grid: every live piece for "all", else the collection the way its page shows it
 *  (including her own answer about sold pieces — see collection-sold-policy.ts). */
export async function liveItemsFor(sellerId: string, collection: string): Promise<CollectionCardItem[]> {
 if (collection === "all") return (await listStorefrontItems(sellerId)).map(toCardItem);
 const c = await getCollectionWithSyncState(sellerId, collection).catch(() => null);
 return (await listCollectionItemsForStorefront(sellerId, c?.id ?? null, collection, c?.keepsSold ?? null)).map(toCardItem);
}

/** One path, in the form her page rows are keyed by ("/about/" and "/about" are one page). */
function normalisePath(path: string): string {
 const p = path || "/";
 return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

export type HostedPageState = { hidden: boolean; title: string | null; menu: StoredMenu | null; hiddenPaths: Set<string>; menuLabels: Map<string, string> };

/**
 * What she has said about this page and this store's menu.
 *
 * Read once per request and cached for a few seconds per store (pages-db.ts), because this is on the
 * path of every hosted page: the hidden-page gate has to run before anything is rendered. A store she
 * has never touched has no rows, and this is two empty results.
 */
export async function hostedPageState(slug: string, path: string): Promise<HostedPageState> {
 try {
  const rows = await loadStoreBuilderRows(slug);
  const p = normalisePath(path);
  const row = rows.pages.get(p) ?? rows.pages.get(path) ?? null;
  // A renamed page wears its new name in the menu too, from its own row — so renaming is ONE write
  // and it reaches the menu even on a store that has never had an order of its own stored.
  const menuLabels = new Map<string, string>();
  for (const [at, r] of rows.pages) {
   const label = (r.navLabel || r.title || "").trim();
   if (label) menuLabels.set(at.length > 1 ? at.replace(/\/+$/, "") : at, label);
  }
  return { hidden: !!row?.hidden, title: row?.title ?? null, menu: rows.menus.get("main") ?? null, hiddenPaths: hiddenPathsOf(rows), menuLabels };
 } catch {
  return { hidden: false, title: null, menu: null, hiddenPaths: new Set(), menuLabels: new Map() }; /* allow-swallow: her site serves exactly as captured */
 }
}

export async function applySiteBuilderForRequest(
 html: string,
 opts: { slug: string; onStoreOrigin: boolean; editor?: boolean; state?: HostedPageState | null; path?: string },
): Promise<string> {
 try {
  const state = opts.state ?? (await hostedPageState(opts.slug, opts.path ?? "/"));
  const grids = hasGridBlocks(html);
  const ctx = { menu: state.menu, hiddenPaths: state.hiddenPaths, menuLabels: state.menuLabels, pageTitle: state.title };
  if (!needsSiteBuilder(html, ctx)) return html;
  // The seller, her collections and her card kit are read ONLY for a page that actually has a grid on
  // it — a menu order must not put three queries on every page of every store.
  if (!grids) return await applySiteBuilder(html, ctx);

  const seller = await getSellerBySlug(opts.slug);
  if (!seller) return await applySiteBuilder(html, ctx);
  const [cols, kit] = await Promise.all([listCollections(seller.id, true).catch(() => []), gridKitForServe(opts.slug)]);
  return await applySiteBuilder(html, {
   ...ctx,
   kit,
   collections: cols.map((c) => c.slug),
   loadItems: (c) => liveItemsFor(seller.id, c),
   hrefFor: hrefForStore(opts.slug, opts.onStoreOrigin),
   keepQuickAdd: opts.onStoreOrigin,
   editor: opts.editor,
  });
 } catch {
  return html; /* allow-swallow: a grid or a menu that can't load must never take the page down with it */
 }
}
