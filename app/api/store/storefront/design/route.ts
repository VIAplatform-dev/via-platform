import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getStorefrontBySlug, setStorefrontTheme, upsertStorefront, normalizeHandle } from "@/app/lib/storefront-db";
import { getVersionTheme, setVersionTheme } from "@/app/lib/storefront-versions-db";
import { STOREFRONT_TEMPLATES, getTemplate, templateTheme, HEADING_FONTS, BODY_FONTS } from "@/app/lib/storefront-templates";
import { BLOCK_TYPES, sanitizeBlocks, sanitizePages, safeSrc } from "@/app/lib/storefront-blocks";
import { isSkin } from "@/app/lib/storefront-skins";
import { getListingsByStore } from "@/app/lib/listings-db";
import { loadStoreProducts } from "@/app/lib/loadStoreProducts";
import { formatPrice } from "@/app/lib/formatPrice";
import { defaultStarterTheme } from "@/app/lib/storefront-default";
import { stores } from "@/app/lib/stores";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listCollections, listCollectionItems } from "@/app/lib/db/collections";
import { importStoreBlocks } from "@/app/lib/store-import";
import { getCaptureOrigin } from "@/app/lib/site-capture-db";
import type { StorefrontTheme } from "@/app/lib/store-import";

export const dynamic = "force-dynamic";
const HEX = /^#[0-9a-fA-F]{6}$/;

// GET — current design (template + colors + fonts), the options, and a few of the
// store's real products so the editor can show a true-to-life live preview.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 // A ?version= means "edit this draft, not the live site". Without it the editor works on the live
 // storefront exactly as before — which is why a two-week project used to have to go live first.
 const versionId = new URL(request.url).searchParams.get("version");
 if (versionId) {
  const v = await getVersionTheme(slug, versionId);
  if (!v) return NextResponse.json({ error: "That design isn’t yours." }, { status: 404 });
  if (v.kind === "imported") {
   return NextResponse.json({ error: "Imported sites are edited on the live site — publish this one first.", importedDraft: true }, { status: 409 });
  }
  return NextResponse.json({ theme: v.theme ?? {}, version: versionId });
 }

 const sf = await getStorefrontBySlug(slug);
 let theme: StorefrontTheme = sf?.theme ?? {};
 // First time the builder opens with no sections yet, seed it. A store that IMPORTED from a URL
 // should see THEIR site pulled one-for-one — so if we captured their site, replicate its homepage
 // sections; only a build-from-scratch store (no capture) gets the polished starter template. This
 // also closes a race where the capture's block import and this seeding could otherwise collide.
 if (!theme.blocks?.length) {
 const name = stores.find((s) => s.slug === slug)?.name || slug.replace(/-/g, " ");
 const origin = await getCaptureOrigin(slug).catch(() => null);
 const imported = origin ? await importStoreBlocks(origin).catch(() => []) : [];
 if (imported.length) {
 theme = { ...theme, blocks: imported };
 } else {
 const d = defaultStarterTheme(name);
 theme = theme.template ? { ...d, template: theme.template, colors: theme.colors, fonts: theme.fonts } : d;
 }
 await setStorefrontTheme(slug, theme).catch(() => {});
 }
 // Same source the live storefront reads its name from, so the editor can't disagree with it.
 const seller = await getSellerBySlug(slug).catch(() => null);
 // Inventory for the builder's product sections. This has to match what the LIVE storefront renders
 // or the seller designs against a different shop than the one shoppers see:
 //  • Same source and same fallback as app/s/StorefrontView.tsx — VYA listings first, synced external
 //    products when a store has none. Without the fallback a synced store's builder looks empty
 //    while its live page is full.
 //  • No image filter. The live grid shows an imageless listing as a blank tile; hiding it here
 //    would silently change the count and the layout.
 //  • 30, not 6: featured layouts ask for up to 26 (see app/s/blocks/featured.tsx), so a smaller cap
 //    under-fills the grid in the editor and only in the editor.
 //  • Price arrives ready to render, formatted the same way the storefront formats it.
 const listings = await getListingsByStore(slug, true).catch(() => []);
 const products = listings.length
 ? listings.slice(0, 30).map((l) => ({ title: l.title, price: formatPrice(l.price, l.currency), image: l.images?.[0] || "" }))
 : (await loadStoreProducts(slug).catch(() => []))
   .slice(0, 30)
   .map((p) => ({ title: p.name, price: p.price, image: p.image || p.images?.[0] || "" }));
 // Collections for the "Products shown" picker — ALL of them, so a seller can point a section at any
 // collection they have. Only the ones a section actually names get their items fetched: that's one
 // query per USED collection rather than per existing one, and a store with forty collections would
 // otherwise pay forty queries to render a page that references one.
 const usedCollectionSlugs = new Set(
  [theme.blocks ?? [], theme.shopBlocks ?? [], ...(theme.extraPages ?? []).map((p) => p.blocks ?? [])]
   .flat()
   .map((b) => (b as { props?: Record<string, string> }).props?.collection)
   .filter((v): v is string => !!v),
 );
 const collections = seller
  ? await Promise.all(
     (await listCollections(seller.id, true).catch(() => [])).map(async (c) => ({
      slug: c.slug,
      title: c.title,
      itemCount: c.itemCount,
      products: usedCollectionSlugs.has(c.slug) && c.itemCount > 0
       ? (await listCollectionItems(c.id).catch(() => []))
          // listCollectionItems returns raw item rows (priceCents), not the dollar Listing view.
          .map((it) => ({ title: it.title, price: formatPrice((it.priceCents ?? 0) / 100, it.currency), image: (it.images as string[] | null)?.[0] || "" }))
       : [],
     })),
    )
  : [];
 return NextResponse.json({
 template: theme.template ?? null,
 colors: { bg: theme.colors?.bg || "#FFFDF8", text: theme.colors?.text || "#1a1a1a", accent: theme.colors?.accent || "#5D0F17" },
 fonts: { heading: theme.fonts?.heading || "Playfair Display", body: theme.fonts?.body || "Inter" },
 radius: theme.radius || "sharp",
 skin: theme.skin ?? "",
 preSkin: theme.preSkin ?? null,
 logo: theme.logo ?? "",
 headerLayout: theme.headerLayout ?? "inline",
 customCss: theme.customCss ?? "",
 blocks: theme.blocks ?? [],
 shopBlocks: theme.shopBlocks ?? [],
 extraPages: theme.extraPages ?? [],
 socials: theme.socials ?? {},
 footerAbout: theme.footerAbout ?? "",
 navLinks: theme.navLinks ?? [],
 // Resolved the SAME way the live storefront resolves it (app/s/StorefrontView.tsx), so the
 // editor's header and the published page can't show two different names. The old chain fell
 // through to the tagline and then the slug, while the live page reached for the store's real
 // name — which is why the studio said "via-admin" and the storefront said "VYA Test Store".
 storeName: sf?.theme?.storeName || stores.find((s) => s.slug === slug)?.name || seller?.name || sf?.tagline || null,
 tagline: sf?.tagline || null,
 templates: STOREFRONT_TEMPLATES,
 blockTypes: BLOCK_TYPES,
 headingFonts: HEADING_FONTS,
 bodyFonts: BODY_FONTS,
 products,
 collections,
 });
}

// POST { template?, colors?, fonts? } — apply a template and/or save customizations.
// A template seeds colors + fonts; explicit colors/fonts override on top (so a store
// can start from a template and tweak from there). All write the storefront theme.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);

 // Ensure a storefront row exists (a brand-new store may not have one yet).
 let sf = await getStorefrontBySlug(slug);
 if (!sf) sf = await upsertStorefront(slug, { handle: normalizeHandle(slug), enabled: false, tagline: "", accentColor: "#5D0F17", heroImage: "", about: "" });

 const theme: StorefrontTheme = { ...(sf.theme ?? {}) };

 // Applying a template lays out a whole STORE, not a colour scheme: the home page, the Shop page's
 // intro and catalogue density, the corner style and header arrangement, and the pages the template
 // ships with (Authentication, Visit, Condition Scale…).
 //
 // Two things are deliberately NOT destructive:
 //   • The seller's existing pages survive. A template page is added only where the store has no
 //     page at that slug — so switching template to try a look never deletes an About page someone
 //     wrote. (Home and Shop ARE replaced; that is what choosing a layout means.)
 //   • `applyContent: false` restyles only — palette, type, corners, header — leaving every section
 //     where it is. That's the path the Design panel uses for a seller who has already built a page.
 if (body?.template) {
 const t = getTemplate(String(body.template));
 const applied = t && templateTheme(t.id);
 if (t && applied) {
  theme.template = t.id;
  theme.colors = { ...applied.colors };
  theme.fonts = { ...applied.fonts };
  theme.radius = applied.radius;
  theme.headerLayout = applied.headerLayout;
  theme.productLayout = applied.productLayout;
  theme.colorsFrom = "studio";
  if (body.applyContent !== false) {
   theme.shopGrid = { ...applied.shopGrid };
   theme.blocks = sanitizeBlocks(applied.blocks);
   theme.shopBlocks = sanitizeBlocks(applied.shopBlocks);
   const existing = sanitizePages(theme.extraPages ?? []);
   const haveSlug = new Set(existing.map((p) => p.slug));
   theme.extraPages = [...existing, ...sanitizePages(applied.extraPages).filter((p) => !haveSlug.has(p.slug))];
  }
 }
 }
 if (body?.colors) {
 const c = body.colors;
 theme.colors = {
 bg: HEX.test(c.bg) ? c.bg : theme.colors?.bg || "#FFFDF8",
 text: HEX.test(c.text) ? c.text : theme.colors?.text || "#1a1a1a",
 accent: HEX.test(c.accent) ? c.accent : theme.colors?.accent || "#5D0F17",
 };
 // Chosen in the studio, so the live page renders this accent as-is rather than second-guessing
 // it the way it must with a palette scraped off an imported site.
 theme.colorsFrom = "studio";
 }
 if (body?.fonts) {
 const f = body.fonts;
 theme.fonts = {
 heading: HEADING_FONTS.includes(f.heading) ? f.heading : theme.fonts?.heading || "Playfair Display",
 body: BODY_FONTS.includes(f.body) ? f.body : theme.fonts?.body || "Inter",
 };
 }

 if (body?.radius === "sharp" || body?.radius === "soft" || body?.radius === "round") theme.radius = body.radius;
 // Store logo. "" clears it (back to the store name in type). Only an uploaded asset URL is stored —
 // safeSrc keeps this from becoming a way to point the header at an arbitrary remote URL.
 if (["inline", "center", "split", "stacked"].includes(String(body?.headerLayout))) theme.headerLayout = body.headerLayout;
 if (typeof body?.logo === "string") { const u = body.logo.trim(); theme.logo = u ? (safeSrc(u) ?? theme.logo ?? null) : null; }
 // Store name (the storefront wordmark). The GET has always READ theme.storeName, but nothing
 // ever wrote it — so the name field in the build wizard was preview-only and the seller's
 // typed name was discarded the moment the wizard closed. Blank is ignored rather than stored,
 // so a client that omits it can't wipe the name off a live store.
 if (typeof body?.storeName === "string") { const n = body.storeName.trim().slice(0, 80); if (n.length >= 2) theme.storeName = n; }
 // Global style skin. "" clears it (back to no skin); anything unrecognized is ignored rather than stored.
 if (typeof body?.skin === "string") { if (body.skin === "") delete theme.skin; else if (isSkin(body.skin)) theme.skin = body.skin; }
 // The pre-skin look, so removing a skin can restore what the store looked like before it. `null`
 // clears it (sent when the skin is removed); an object stores it (sent when the first skin is applied).
 if (body?.preSkin === null) delete theme.preSkin;
 else if (body?.preSkin && typeof body.preSkin === "object") {
 const c = body.preSkin.colors, f = body.preSkin.fonts;
 const hex = (v: unknown) => (/^#[0-9a-fA-F]{6}$/.test(String(v ?? "")) ? String(v) : undefined);
 const pre: NonNullable<typeof theme.preSkin> = {};
 if (c) { const bg = hex(c.bg), text = hex(c.text), accent = hex(c.accent); if (bg && text && accent) pre.colors = { bg, text, accent }; }
 if (f) { const heading = HEADING_FONTS.includes(f.heading) ? f.heading : undefined; const bodyF = BODY_FONTS.includes(f.body) ? f.body : undefined; if (heading && bodyF) pre.fonts = { heading, body: bodyF }; }
 if (pre.colors || pre.fonts) theme.preSkin = pre;
 }

 // Catalogue density on the Shop page. Each field is validated against its own allowlist and applied
 // independently, so a partial update ("just make it 2-up") keeps the ratio and gutter already set.
 if (body?.shopGrid && typeof body.shopGrid === "object") {
 const g = body.shopGrid as Record<string, unknown>;
 const next = { ...(theme.shopGrid ?? {}) };
 const cols = Number(g.cols);
 if (cols === 2 || cols === 3 || cols === 4 || cols === 5) next.cols = cols;
 if (["4/5", "1/1", "5/6", "3/4"].includes(String(g.ratio))) next.ratio = g.ratio as NonNullable<StorefrontTheme["shopGrid"]>["ratio"];
 if (["tight", "normal", "wide"].includes(String(g.gutter))) next.gutter = g.gutter as NonNullable<StorefrontTheme["shopGrid"]>["gutter"];
 theme.shopGrid = next;
 }

 if (["classic", "rail", "stacked"].includes(String(body?.productLayout))) theme.productLayout = body.productLayout;

 if (Array.isArray(body?.blocks)) theme.blocks = sanitizeBlocks(body.blocks);
 if (Array.isArray(body?.shopBlocks)) theme.shopBlocks = sanitizeBlocks(body.shopBlocks);
 if (Array.isArray(body?.extraPages)) theme.extraPages = sanitizePages(body.extraPages);
 if (typeof body?.customCss === "string") theme.customCss = body.customCss.slice(0, 20000);
 // Footer: social links (only http(s)/mailto or a bare handle) + a short about blurb.
 if (body?.socials && typeof body.socials === "object") {
 const keys = ["instagram", "tiktok", "facebook", "youtube", "pinterest", "email"] as const;
 const out: Record<string, string> = {};
 for (const k of keys) { const v = String(body.socials[k] ?? "").trim().slice(0, 300); if (v) out[k] = v; }
 theme.socials = out;
 }
 if (typeof body?.footerAbout === "string") theme.footerAbout = body.footerAbout.slice(0, 300);
 // Custom header/footer links (label + href + where to show).
 if (Array.isArray(body?.navLinks)) {
 theme.navLinks = (body.navLinks as unknown[]).map((l) => {
 const o = l as { label?: unknown; href?: unknown; place?: unknown };
 const label = String(o?.label ?? "").trim().slice(0, 40);
 const href = String(o?.href ?? "").trim().slice(0, 400);
 const place = o?.place === "header" || o?.place === "footer" || o?.place === "both" ? o.place : "both";
 return label && href ? { label, href, place } : null;
 }).filter(Boolean).slice(0, 12) as { label: string; href: string; place: "header" | "footer" | "both" }[];
 }

 // Writing to a draft leaves the live storefront completely alone — that is the whole point of
 // being able to edit one without publishing it.
 const targetVersion = typeof body?.version === "string" && body.version ? body.version : null;
 if (targetVersion) {
  if (!(await setVersionTheme(slug, targetVersion, theme))) {
   return NextResponse.json({ error: "That design isn’t yours." }, { status: 404 });
  }
 } else {
  await setStorefrontTheme(slug, theme);
 }
 return NextResponse.json({ ok: true, template: theme.template ?? null, colors: theme.colors, fonts: theme.fonts, radius: theme.radius ?? "sharp", skin: theme.skin ?? "", preSkin: theme.preSkin ?? null, customCss: theme.customCss ?? "", blocks: theme.blocks ?? [], shopBlocks: theme.shopBlocks ?? [], extraPages: theme.extraPages ?? [] });
}
