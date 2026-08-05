import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny, isOwner } from "@/app/lib/storeAuth";
import { crawlAndStore } from "@/app/lib/site-capture";
import { listCapturePaths, getCapturePage, getCaptureOrigin, deleteCaptures } from "@/app/lib/site-capture-db";
import { importStoreFromUrl, type ImportedProduct } from "@/app/lib/store-import";
import { importProductsAsItems } from "@/app/lib/capture-commerce";
import { getConnection } from "@/app/lib/store-connections-db";
import { getPlatform } from "@/app/lib/platforms";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { deleteAllItems } from "@/app/lib/db/inventory";
import { ensureCollection } from "@/app/lib/db/collections";
import { getStorefrontBySlug } from "@/app/lib/storefront-db";

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
 return NextResponse.json({ captured: paths.length, url: paths.length ? await siteViewUrl(slug) : null, origin, pages: paths, isAdmin: isOwner(request, slug) });
}

// POST { url } — capture the seller's entire existing site and host every page on VYA.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const url = body?.url ? String(body.url).trim() : "";
 if (!url) return NextResponse.json({ error: "Paste your site URL." }, { status: 400 });

 try {
 const r = await crawlAndStore(slug, url, 100);
 // Products come in as checkout-able items regardless of design capture (the
 // connected-store API path works even when the public site is locked).
 const items = await importProductsAsItems(slug, await pullProducts(slug, url)).catch(() => 0);

 // Pre-create VYA collections that mirror the store's captured collection pages, so the
 // seller can assign items to them (slug = the Shopify handle → items render on that page).
 try {
 const seller = await getSellerBySlug(slug);
 if (seller) {
  const handles = new Set<string>();
  for (const p of r.paths) { const m = p.match(/^\/collections\/([^/]+)\/?$/); if (m && m[1] !== "all") handles.add(m[1]); }
  const titleize = (h: string) => h.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  for (const h of handles) await ensureCollection(seller.id, h, titleize(h)).catch(() => {});
 }
 } catch { /* non-fatal — assignment can create collections on demand too */ }

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
 return NextResponse.json({ ok: true, pages: r.pages, items, url: await siteViewUrl(slug) });
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
