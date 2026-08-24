import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny, isOwner } from "@/app/lib/storeAuth";
import { crawlAndStore } from "@/app/lib/site-capture";
import { listCapturePaths, getCapturePage, getCaptureOrigin, deleteCaptures } from "@/app/lib/site-capture-db";
import { importStoreFromUrl, importStoreBlocks, importStoreThemeAndBlocks, type ImportedProduct } from "@/app/lib/store-import";
import { importProductsAsItems, syncCollectionMembership } from "@/app/lib/capture-commerce";
import { getConnection } from "@/app/lib/store-connections-db";
import { getPlatform } from "@/app/lib/platforms";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { deleteAllItems } from "@/app/lib/db/inventory";
import { ensureCollection } from "@/app/lib/db/collections";
import { isJunkCollection } from "@/app/lib/collections-sync";
import { getStorefrontBySlug, setStorefrontTheme } from "@/app/lib/storefront-db";
import { buildStorefrontFromUrl } from "@/app/lib/storefront-from-brand";

// The captured site is served by the MARKETPLACE app (vyaplatform.com/site/{slug}) or the
// store's own connected domain — NOT the getvya.ai OS host the seller is viewing this from.
// Returning a relative "/site/{slug}" made "View your site" 404 (it opened on getvya.ai, which
// doesn't serve /site). Always return an absolute URL to where the site actually lives.
async function siteViewUrl(slug: string): Promise<string> {
 const sf = await getStorefrontBySlug(slug).catch(() => null);
 const cd = (sf?.customDomain || "").replace(/^https?:\/\//, "").replace(/\/+$/, "").trim().toLowerCase();
 // Use a connected domain ONLY if it's a real external domain. A VYA host (or a bare
 // "vyaplatform.com" left in custom_domain) would send the seller to the marketplace
 // home instead of their captured site — fall through to /site/{slug} in that case.
 const isVyaHost = cd === "vyaplatform.com" || cd.endsWith(".vyaplatform.com") || cd === "getvya.ai" || cd.endsWith(".getvya.ai");
 if (cd && cd.includes(".") && !isVyaHost) return `https://${cd}`;
 return `https://vyaplatform.com/site/${slug}`;
}

// Shopify's "store is password-protected" lock screen looks like a real page, so a
// naive crawl would capture it. Detect it so we don't host the lock screen.
function looksPasswordProtected(html: string): boolean {
 return /template-password|action=["']\/password|id=["']password|store is password|opening soon/i.test(html);
}

// Products: prefer a connected store's API (exact data, works even behind a store
// password) over the public feed.
async function pullProducts(slug: string, url: string): Promise<ImportedProduct[]> {
 const conn = await getConnection(slug).catch(() => null);
 if (conn) {
 const adapter = getPlatform(conn.platform);
 if (adapter?.getProducts) {
 const api = await adapter.getProducts(conn.credentials).catch(() => []);
 if (api.length) return api;
 }
 }
 return (await importStoreFromUrl(url).catch(() => ({ products: [] as ImportedProduct[] }))).products || [];
}

export const dynamic = "force-dynamic";
export const maxDuration = 300; // a full-site crawl can take a couple minutes

// GET — capture status for the acting store.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const paths = await listCapturePaths(slug).catch(() => []);
 const origin = paths.length ? await getCaptureOrigin(slug).catch(() => null) : null;
 // isAdmin gates the owner-only "reset to simple design + wipe inventory" action.
 // `url` is the ABSOLUTE public view URL (for "View your site"); `slug` lets the editor build a
 // SAME-ORIGIN /site/{slug} preview so it works on localhost / getvya.ai, not just prod.
 return NextResponse.json({ captured: paths.length, url: paths.length ? await siteViewUrl(slug) : null, slug, origin, pages: paths, isAdmin: isOwner(request, slug) });
}

// POST { url } — capture the seller's entire existing site and host every page on VYA.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const url = body?.url ? String(body.url).trim() : "";
 // When the seller explicitly (re)imports their site — e.g. from onboarding — the block storefront
 // should BECOME that site, replacing any stale/starter blocks. Otherwise we only seed empty ones.
 const replaceBlocks = body?.replaceBlocks === true;
 if (!url) return NextResponse.json({ error: "Paste your site URL." }, { status: 400 });

 try {
 const r = await crawlAndStore(slug, url, 100);
 // A site that renders in the browser (Wix, a single-page app) returns almost nothing to crawl.
 // Rather than leave the seller with a broken copy or a blank starter, build them a VYA storefront
 // from their BRAND — the colours, fonts, logo, name and menu labels survive in the HTML even when
 // the layout doesn't. Inventory then comes from the CSV upload or a platform connection.
 if (r.pages <= 1) {
  const built = await buildStorefrontFromUrl(url).catch(() => null);
  if (built) {
   await setStorefrontTheme(slug, built.theme).catch(() => {});
   return NextResponse.json({
    ok: true, mode: "brand", pages: 0, items: 0,
    url: await siteViewUrl(slug),
    brand: built.brand.found,
    note: `We couldn't copy this site's pages — it builds them in the browser. We've set up your VYA storefront using your ${built.brand.found.join(", ")} instead. Add your inventory by uploading a CSV or connecting your store.`,
   });
  }
 }
 // Products come in as checkout-able items regardless of design capture (the
 // connected-store API path works even when the public site is locked).
 // Products are matched by SOURCE IDENTITY, so a re-run updates the store's catalog in place
 // (added / updated / removed) instead of wiping and re-adding it — that's what lets inventory
 // stay in sync without a destructive re-crawl.
 const pulled = await pullProducts(slug, url);
 const stats = await importProductsAsItems(slug, pulled)
  .catch(() => ({ added: 0, updated: 0, unchanged: 0, skipped: 0, removed: 0 }));
 const items = stats.added + stats.updated + stats.unchanged;

 // Pre-create VYA collections that mirror the store's captured collection pages, so the
 // seller can assign items to them (slug = the Shopify handle → items render on that page).
 try {
 const seller = await getSellerBySlug(slug);
 if (seller) {
  const handles = new Set<string>();
  for (const p of r.paths) { const m = p.match(/^\/collections\/([^/]+)\/?$/); if (m && m[1] !== "all") handles.add(m[1]); }
  const titleize = (h: string) => h.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  // Skip the store's operational collections (price bands, presales/drops, demo data, catch-alls) —
  // importing 100+ junk collections just floods the seller's picker. Real ones (brands, eras, categories) stay.
  for (const h of handles) { const title = titleize(h); if (!isJunkCollection(title)) await ensureCollection(seller.id, h, title).catch(() => {}); }
 }
 } catch { /* non-fatal — assignment can create collections on demand too */ }

 // …then actually PUT the imported items in those collections. Without this the collections stay
 // empty, and a captured /collections/{handle} page silently falls back to the frozen source grid
 // instead of the store's live VYA inventory — which is the whole point of the swap.
 const membership = await syncCollectionMembership(slug, new URL(url.startsWith("http") ? url : `https://${url}`).hostname, pulled)
  .catch(() => ({ collections: 0, links: 0 }));

 // Seed the visual studio with a section-by-section replica of the real homepage, so
 // the builder mirrors the seller's actual layout instead of a generic starter template.
 // Only when they haven't already built/edited a block design — never clobber real work.
 try {
 const sf = await getStorefrontBySlug(slug).catch(() => null);
 if (replaceBlocks || !sf?.theme?.blocks?.length) {
  // Pull their homepage as blocks AND their real theme (colours, fonts, logo, brand name) so the
  // studio mirrors THEIR store — not our starter palette/type wrapped around their content.
  const imported = await importStoreThemeAndBlocks(url).catch(() => ({ theme: null, blocks: [] as Awaited<ReturnType<typeof importStoreBlocks>>, name: null }));
  if (imported.blocks.length) {
   const prev = sf?.theme || {};
   await setStorefrontTheme(slug, {
    ...prev,
    blocks: imported.blocks,
    colors: { ...prev.colors, ...(imported.theme?.colors || {}) }, // their palette wins, ours fills gaps
    fonts: { ...prev.fonts, ...(imported.theme?.fonts || {}) },
    ...(imported.theme?.logo ? { logo: imported.theme.logo } : {}),
    ...(imported.name ? { storeName: imported.name } : {}), // their brand name in the header wordmark
   }).catch(() => {});
  }
 }
 } catch { /* non-fatal — studio falls back to the starter template */ }

 // Password-protected? The crawl either reads nothing or only grabs the lock
 // screen — don't host that. Import products (if a store is connected) and tell
 // the seller to drop the password so we can capture their real design.
 const home = r.pages ? await getCapturePage(slug, "/").catch(() => null) : null;
 const locked = !r.pages || (r.pages <= 2 && !!home && looksPasswordProtected(home));
 if (locked) {
 const base = "Your storefront looks password-protected, so we couldn’t capture its design. Remove the password (Shopify: Online Store → Preferences) and re-run to bring your exact site over.";
 if (items > 0) return NextResponse.json({ ok: true, pages: 0, items, url: await siteViewUrl(slug), note: `${base} (We did import your ${items} products.)` });
 return NextResponse.json({ error: `${base} Or connect your store above to import just your products.` }, { status: 400 });
 }
 return NextResponse.json({ ok: true, pages: r.pages, items, products: stats, collections: membership, url: await siteViewUrl(slug) });
 } catch (e) {
 console.error("site capture error:", e);
 return NextResponse.json({ error: e instanceof Error ? e.message : "Capture failed." }, { status: 502 });
 }
}

// DELETE — discard the captured site so the storefront falls back to the simple
// template / section builder.
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 // Owner/admin only — this is a destructive reset, not a per-seller feature.
 if (!isOwner(request, slug)) return NextResponse.json({ error: "Owner only" }, { status: 403 });
 await deleteCaptures(slug).catch(() => {});
 // Also wipe the inventory the capture imported, for a true clean slate.
 const seller = await getSellerBySlug(slug).catch(() => null);
 const itemsDeleted = seller ? await deleteAllItems(seller.id).catch(() => 0) : 0;
 return NextResponse.json({ ok: true, itemsDeleted });
}
