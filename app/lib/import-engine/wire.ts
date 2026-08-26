// Wiring: connects the pure pipeline (run-import.ts) to the real crawler, importer and database.
//
// It lives apart from the API route because TWO callers need identical behaviour — the seller's
// request and the sweeper cron that continues an import nobody is watching. A second copy in the
// cron would drift, and the resumed half of an import would quietly stop matching the first half.
//
// Nothing here is unit tested directly (it is the glue); everything it is glued to is.
import { crawlAndStore } from "@/app/lib/site-capture";
import { getCapturePage } from "@/app/lib/site-capture-db";
import { importStoreFromUrl, importStoreThemeAndBlocks, type ImportedProduct } from "@/app/lib/store-import";
import { importProductsAsItems, syncCollectionMembership, syncCollectionOrder } from "@/app/lib/capture-commerce";
import { getConnection } from "@/app/lib/store-connections-db";
import { getPlatform } from "@/app/lib/platforms";
import { getSellerBySlug, getOrCreateSeller } from "@/app/lib/db/sellers";
import { ensureCollection } from "@/app/lib/db/collections";
import { isJunkCollection } from "@/app/lib/collections-sync";
import { getStorefrontBySlug, setStorefrontTheme } from "@/app/lib/storefront-db";
import { buildStorefrontFromUrl } from "@/app/lib/storefront-from-brand";
import { runImport, type ImportDeps, type RunOutcome } from "./run-import";
import { saveJob } from "./jobs-db";
import { scoreCaptureHtml, importWarnings } from "./checks";
import { storeHostSuffix } from "@/app/lib/plan-b/store-host";
import { stores, storeContactEmails } from "@/app/lib/stores";
import type { ImportJob } from "./report";

/** Shopify's "store is password-protected" lock screen looks like a real page, so a naive crawl
 *  would capture it. Detect it so we don't host the lock screen. */
export function looksPasswordProtected(html: string): boolean {
 return /template-password|action=["']\/password|id=["']password|store is password|opening soon/i.test(html);
}

const hostOf = (u: string) => new URL(u.startsWith("http") ? u : `https://${u}`).hostname;

export function buildImportDeps(jobId: string): ImportDeps<ImportedProduct> {
 return {
  // Keep the seller's JavaScript in the capture whenever Plan B is configured — it's what their
  // hosted storefront will need in order to behave like their real site. Storing it is safe on its
  // own: the serve path strips every script on any VYA origin, so only the isolated store domain
  // ever runs it.
  crawl: async ({ slug, url, maxPages, resume, budgetMs, onProgress }) =>
   crawlAndStore(slug, url, maxPages, { resume, budgetMs, onProgress, keepScripts: Boolean(storeHostSuffix()) }),

  // Prefer a connected store's API (exact data, works even behind a store password) over the public
  // feed. Errors propagate into the step record rather than returning an empty list, so "no products
  // found" and "the product import crashed" stop looking the same.
  pullProducts: async (slug, url) => {
   const conn = await getConnection(slug);
   if (conn) {
    const adapter = getPlatform(conn.platform);
    if (adapter?.getProducts) {
     const api = await adapter.getProducts(conn.credentials);
     if (api.length) return api;
    }
   }
   return (await importStoreFromUrl(url)).products || [];
  },

  importItems: async (slug, products) => importProductsAsItems(slug, products),

  // Pre-create VYA collections mirroring the store's captured /collections/{handle} pages, so the
  // seller can assign items to them (slug = the source handle → items render on that page).
  ensureCollections: async (slug, paths) => {
   const seller = await getSellerBySlug(slug);
   if (!seller) return 0;
   const handles = new Set<string>();
   for (const p of paths) { const m = p.match(/^\/collections\/([^/]+)\/?$/); if (m && m[1] !== "all") handles.add(m[1]); }
   const titleize = (h: string) => h.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
   let made = 0;
   // Skip the store's operational collections (price bands, presales/drops, demo data, catch-alls) —
   // importing 100+ junk collections just floods the seller's picker.
   for (const h of handles) {
    const title = titleize(h);
    if (isJunkCollection(title)) continue;
    await ensureCollection(seller.id, h, title);
    made++;
   }
   return made;
  },

  syncMembership: async (slug, url, products) => {
   const r = await syncCollectionMembership(slug, hostOf(url), products);
   // Then adopt the source's own ordering for those collections — membership without order still
   // reads as a different shop, because nothing is where the seller put it.
   const o = await syncCollectionOrder(slug).catch((e) => {
    r.warnings = [...(r.warnings || []), `We couldn’t copy the order of your collections (${e instanceof Error ? e.message : String(e)}); they’ll show newest first.`];
    return { collections: 0, ordered: 0 };
   });
   return { ...r, collections: Math.max(r.collections, o.collections) };
  },

  // Seed the visual studio with a section-by-section replica of the real homepage. Only when they
  // haven't already built/edited a block design — never clobber real work.
  importBlocks: async (slug, url, replaceBlocks) => {
   const sf = await getStorefrontBySlug(slug);
   if (!replaceBlocks && sf?.theme?.blocks?.length) return 0;
   const imported = await importStoreThemeAndBlocks(url);
   if (!imported.blocks.length) return 0;
   const prev = sf?.theme || {};
   await setStorefrontTheme(slug, {
    ...prev,
    blocks: imported.blocks,
    colors: { ...prev.colors, ...(imported.theme?.colors || {}) }, // their palette wins, ours fills gaps
    fonts: { ...prev.fonts, ...(imported.theme?.fonts || {}) },
    ...(imported.theme?.logo ? { logo: imported.theme.logo } : {}),
    ...(imported.name ? { storeName: imported.name } : {}), // their brand name in the header wordmark
   });
   return imported.blocks.length;
  },

  // Did the copy actually come out right? The same checks the eval harness scores stores with, run
  // over what we just captured — so a deleted nav or an unmatched product grid is reported at import
  // time instead of being found by a seller weeks later.
  checkCapture: async (slug, paths) => {
   const sample = ["/", ...paths.filter((p) => /^\/collections\/[^/]+\/?$/.test(p)).slice(0, 2)];
   const out: string[] = [];
   for (const p of [...new Set(sample)]) {
    const html = await getCapturePage(slug, p);
    if (!html) continue;
    out.push(...importWarnings(scoreCaptureHtml(html), p));
   }
   return out;
  },

  buildBrandStorefront: async (slug, url) => {
   const built = await buildStorefrontFromUrl(url);
   if (!built) return null;
   await setStorefrontTheme(slug, built.theme);
   return { found: built.brand.found };
  },

  isLocked: async (slug, pages) => {
   if (!pages) return true;
   if (pages > 2) return false;
   const home = await getCapturePage(slug, "/");
   return !!home && looksPasswordProtected(home);
  },

  save: async (patch) => saveJob(jobId, patch),
 };
}

/** Run or continue a job with the real dependencies. */
export async function runImportJob(job: ImportJob, opts: { replaceBlocks?: boolean } = {}): Promise<RunOutcome> {
 // The product/collection steps look the seller up by slug and silently no-op (0 products, no
 // warning) if it doesn't exist — the pipeline never creates one itself. Onboarding normally does
 // this before a seller ever reaches "import your site", but this is the single choke point BOTH
 // the route (fresh AND resumed imports) and the sweeper cron pass through, so it's the one place
 // that can guarantee the invariant — including for a job resumed from state that predates this
 // fix, or that was created by another process. Idempotent (`onConflictDoNothing`), so it's a cheap
 // no-op read once the seller exists.
 const knownStore = stores.find((st) => st.slug === job.slug);
 await getOrCreateSeller(job.slug, knownStore?.name || job.slug, storeContactEmails[job.slug] || "");

 // A page-count cap, unlike the time budget, doesn't pause and resume — it just stops and marks
 // the job "done", silently truncating a big catalog's DESIGN capture (individual product pages,
 // category listings) while the separate, uncapped products feed still imports every item. Seen
 // live: a ~1500-product store capped at 100 pages with 928 still queued — its product page links
 // 404 even though the products themselves are all there. The 180s time budget below is the real,
 // resumable pacing mechanism (proven: a crawl killed mid-run resumes from where it stopped rather
 // than restarting), so this only needs to be high enough that it's never the thing actually
 // stopping a real store's crawl.
 return runImport<ImportedProduct>(job, buildImportDeps(job.id), { maxPages: 3000, replaceBlocks: opts.replaceBlocks === true });
}

/** Continue an interrupted job (the sweeper's path). Marks it running first so a concurrent sweep
 *  doesn't pick up the same job. */
export async function resumeImportJob(job: ImportJob): Promise<RunOutcome> {
 await saveJob(job.id, { status: "running" });
 return runImportJob(job);
}
