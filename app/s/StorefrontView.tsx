/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";
import { stores } from "@/app/lib/stores";
import SearchBox from "./SearchBox";
import { loadStoreProducts } from "@/app/lib/loadStoreProducts";
import { getListingsByStore, type Listing } from "@/app/lib/listings-db";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getCollectionBySlug, listCollectionItems, listCollections } from "@/app/lib/db/collections";
import { formatPrice } from "@/app/lib/formatPrice";
import { normalizeCategory, familyMembers, CATEGORY_FAMILIES } from "@/app/lib/market-data-db";
import type { StorefrontSettings } from "@/app/lib/storefront-db";
import NewsletterForm from "./NewsletterForm";
import SiteEffects from "./SiteEffects";
import { resolveEffects, hasEffects } from "@/app/lib/storefront-effects";
import { headers } from "next/headers";
import { isStoreHost } from "@/app/lib/plan-b/store-host";
import { storefrontScript } from "@/app/lib/storefront-code";
import Blocks from "./Blocks";
import { sanitizeBlocks, sanitizePages } from "@/app/lib/storefront-blocks";
import { stripThemeBackgroundOverrides } from "@/app/lib/theme-css";
import { StoreFooter } from "@/app/s/StoreChrome";

/** Render the raw price string sensibly (loadStoreProducts may or may not prefix a symbol). */
function fmtPrice(price: string): string {
 const p = (price || "").trim();
 if (!p) return "";
 return /^[£$€¥]/.test(p) ? p : `$${p}`;
}

type Tile = { key: string; title: string; price: string; image: string; size: string | null; href: string | null; itemId?: string; sold?: boolean };

/** Build a Google Fonts stylesheet URL from the theme's font families. */
function googleFontsHref(families: string[]): string | null {
 const fams = Array.from(new Set(families.filter(Boolean)));
 if (!fams.length) return null;
 const q = fams.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`).join("&");
 return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

// Shared storefront render — used by /s/[handle] and the custom-domain route.
// Applies the store's extracted theme (fonts, colour palette, logo).
export default async function StorefrontView({ settings, view = "home", preview = false, category, query, pageSlug, collectionSlug }: { settings: StorefrontSettings; view?: "home" | "shop"; preview?: boolean; category?: string; query?: string; pageSlug?: string; collectionSlug?: string }) {
 const sf = settings;
 const onOwnOrigin = isStoreHost((await headers()).get("host"));
 // Store metadata: prefer hardcoded stores.ts, fall back to the sellers table,
 // then the handle — so DB-based sellers (not in stores.ts) still render.
 const store = stores.find((s) => s.slug === sf.storeSlug);
 const seller = await getSellerBySlug(sf.storeSlug).catch(() => null);
 const storeName = sf.theme?.storeName || store?.name || seller?.name || sf.handle.replace(/-/g, " ");
 const location = store?.location || null;

 // Single product source of truth = db/items (via getListingsByStore, now a view
 // over items). Active items are buyable (itemId set); sold ones show badged like
 // the source store. Synced external products are the fallback for stores not yet
 // on VYA inventory.
 const [products, listings] = await Promise.all([
 loadStoreProducts(sf.storeSlug).catch(() => []),
 getListingsByStore(sf.storeSlug, true).catch(() => []), // active only — sold pieces don't clutter the storefront
 ]);

 // Available first, sold last.
 const sortedListings = [...listings].sort((a, b) => Number(a.status === "sold") - Number(b.status === "sold"));
 // Collection page: keep only the items assigned to this collection (its slug). "all"
 // means the whole catalogue, so no membership filter. (Reuses the `seller` above.)
 const storeCollections = seller ? await listCollections(seller.id).catch(() => []) : [];
 let collectionTitle: string | null = null;
 let collectionIds: Set<string> | null = null;
 if (collectionSlug && collectionSlug !== "all" && seller) {
 const col = await getCollectionBySlug(seller.id, collectionSlug).catch(() => null);
 if (col) { collectionTitle = col.title; const cis = await listCollectionItems(col.id).catch(() => []); collectionIds = new Set(cis.map((i) => i.id)); }
 }
 // Category filter (Shop dropdown): match the slug against the item's category or
 // legacy tags, tolerant of plural/singular (heels↔Heels, dress↔Dresses).
 const catSlug = (category || "").toLowerCase();
 const catWords = catSlug.split("-").map((w) => w.replace(/s$/, "")).filter((w) => w.length > 2);
 const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
 const catFields = (l: Listing) => [...(l.tags || []), l.category || ""].filter(Boolean);
 // A family slug ("clothing") stands for every bucket underneath it, so the Shop menu's group
 // heading is a real destination and not just a label. Checked first and exactly — the loose word
 // matching below would never connect "clothing" to a listing categorised "Skirts".
 // Only a family that actually groups SEVERAL buckets takes this path. "bags" is a family of one, and
 // routing it here would quietly retire the tag matching that imported stores' own menus depend on.
 const familyBuckets = familyMembers(catSlug).length > 1 ? familyMembers(catSlug) : [];
 // A DECADE tile ("1990s", "90s") is a real way to shop an archive, and Provenance ships an era
 // timeline as one of its two taxonomies. Era isn't a category field, so match it the way the era is
 // actually written: the copy study found it is nearly always in the product title itself
 // ("Versace SS 2005 Coral Reef Print Top"). Without this an era tile opens an empty aisle.
 const dm = /^(?:(19|20)(\d0)|(\d0))s$/.exec(catSlug);
 const decade = dm ? (dm[1] ? `${dm[1]}${dm[2]}` : Number(dm[3]) >= 30 ? `19${dm[3]}` : `20${dm[3]}`) : null;
 // For "1990": any year 1990–1999, or the decade written long or short.
 const decadeRe = decade ? new RegExp(`\\b(?:${decade.slice(0, 3)}\\d|${decade}s|${decade.slice(2)}s)\\b`, "i") : null;
 const matchesCat = (l: Listing) => {
 if (decadeRe) return decadeRe.test(`${l.title} ${(l.tags || []).join(" ")} ${l.category || ""}`);
 if (familyBuckets.length) {
  const bucket = normalizeCategory(l.category || "");
  return !!bucket && familyBuckets.includes(bucket);
 }
 const f = catFields(l);
 if (f.some((t) => toSlug(t) === catSlug)) return true; // exact collection membership
 const t = f.map((x) => x.toLowerCase().replace(/s$/, ""));
 return catWords.some((w) => t.some((tag) => tag.includes(w) || w.includes(tag)));
 };
 // Whether the category slug gave us anything to filter ON. A slug too short to word-match ("90s")
 // still filters when it parsed as a decade, and must not silently fall through to "show everything".
 const catFilters = !!category && (catWords.length > 0 || !!decadeRe || familyBuckets.length > 0);
 const q = (query || "").trim().toLowerCase();
 const shownListings = sortedListings
 .filter((l) => (collectionIds ? collectionIds.has(l.id) : true))
 .filter((l) => (catFilters ? matchesCat(l) : true))
 .filter((l) => (q ? l.title.toLowerCase().includes(q) || catFields(l).some((t) => t.toLowerCase().includes(q)) : true));
 const toTile = (l: Listing): Tile => ({ key: `l${l.id}`, title: l.title, price: formatPrice(l.price, l.currency), image: l.images[0] || "", size: l.size, href: null, itemId: l.status !== "sold" ? l.id : undefined, sold: l.status === "sold" });
 const items: Tile[] = listings.length
 ? shownListings.map(toTile)
 : products.map((p) => ({ key: p.id, title: p.name, price: fmtPrice(p.price), image: p.image || p.images?.[0] || "", size: p.size ?? null, href: p.externalUrl || null }));
 // The unfiltered catalogue, kept so a filter that matches nothing can fall back to it rather than
 // dead-ending. A category tile is a promise; the worst it should do is over-promise, not strand.
 const allTiles: Tile[] = listings.length ? sortedListings.map(toTile) : items;

 // ── Theme ──
 const theme = sf.theme || {};
 // Headings/buttons/prices take the accent — but only when we can trust it.
 //   • A palette SCRAPED from an imported site: the extracted "accent" is often a spurious CSS
 //     colour (a sale-tag red, a link blue), so the site's own ink is the reliable match.
 //   • A palette CHOSEN in the studio: the seller clicked that colour and watched the preview use
 //     it. Overriding it here is how the live page stops matching the editor. Honour it exactly.
 // No marker means a theme saved before this distinction existed — treated as chosen, since the
 // studio is where the overwhelming majority of these palettes came from.
 const scraped = theme.colorsFrom === "imported";
 const accent = (scraped
  ? theme.colors?.text || theme.colors?.accent
  : theme.colors?.accent || theme.colors?.text) || sf.accentColor || "#5D0F17";
 const bg = theme.colors?.bg || "#FFFDF8";
 const text = theme.colors?.text || "#241c17";
 const headingFont = theme.fonts?.heading;
 const bodyFont = theme.fonts?.body;
 const radius = theme.radius || "sharp"; // global corner style ("shapes")
 const skin = theme.skin || undefined; // global style skin (type scale, spacing, button shape)
 const logo = theme.logo || null;
 const headerLayout = theme.headerLayout || "inline";

 const vars: Record<string, string> = { "--accent": accent, "--bg": bg, "--text": text };
 if (headingFont) vars["--font-heading"] = `'${headingFont}', Georgia, serif`;
 if (bodyFont) vars["--font-body"] = `'${bodyFont}', system-ui, sans-serif`;
 const rootStyle = { ...vars, background: bg, color: text, ...(bodyFont ? { fontFamily: "var(--font-body)" } : {}) } as CSSProperties;
 const headingStyle: CSSProperties = headingFont ? { fontFamily: "var(--font-heading)", color: accent } : { color: accent };
 // Per-section heading-font overrides (deep style inspector) must be loaded too, or they'd fall back.
 const blockHeadingFonts = [
 ...(theme.blocks ?? []),
 ...(theme.shopBlocks ?? []),
 ...((theme.extraPages ?? []).flatMap((p) => p.blocks ?? [])),
 ].map((b) => (b?.style as { headingFont?: string } | undefined)?.headingFont).filter(Boolean) as string[];
 const fontsHref = googleFontsHref([headingFont, bodyFont, ...blockHeadingFonts].filter(Boolean) as string[]);
 const nav = theme.nav ?? [];
 const pages = theme.pages ?? [];
 const sections = theme.sections ?? [];
 const categories = theme.categories ?? [];
 // The Shop dropdown. An imported site arrives with its own nav categories (theme.categories) and
 // those win — they're the seller's real menu. A store built in the studio has none, so derive them
 // from what's actually IN STOCK, bucketed by the platform's canonical normalizeCategory: "skirt",
 // "Skirts" and "MINI SKIRT" all collapse to one entry, and the labels match the numbers everywhere
 // else on VYA. Only buckets holding a live item appear, so the menu can never open an empty aisle.
 // Busiest first, so a store with one skirt and forty bags leads with Bags.
 type MenuEntry = { label: string; slug: string; children: { label: string; slug: string }[] };
 const shopMenu: MenuEntry[] = categories.length
  ? categories.map((c) => ({ label: c.label, slug: c.slug, children: [] }))
  : (() => {
   // ONLY the item's category field. Not tags, not the title: normalizeCategory checks Tops before
   // Bags, so a "top handle" tag on a Chanel flap lands the store an entire Tops aisle holding one
   // handbag. An uncategorised item simply doesn't vote — a missing aisle is recoverable, a lying
   // one sends the shopper to a page that doesn't hold what it promised.
   const tally = new Map<string, number>();
   for (const l of sortedListings) {
    const bucket = normalizeCategory(l.category || "");
    if (bucket) tally.set(bucket, (tally.get(bucket) || 0) + 1);
   }
   // Grouped a tier up (Clothing → Tops · Skirts), because nobody scans thirteen flat buckets.
   // Family order is fixed rather than by count — a menu that reshuffles itself as stock turns over
   // is a menu returning shoppers can't learn. Within a family, the fullest aisle leads.
   const out: MenuEntry[] = [];
   for (const fam of CATEGORY_FAMILIES) {
    const present = fam.members
     .filter((m) => tally.has(m))
     .sort((a, b) => tally.get(b)! - tally.get(a)! || a.localeCompare(b));
    if (!present.length) continue;
    // A heading that expands to a single child just says the same thing twice — so a family
    // holding one bucket (or holding only one in THIS store) becomes a plain link.
    if (present.length === 1) {
     const only = fam.members.length === 1 ? fam.label : present[0];
     out.push({ label: only, slug: toSlug(only), children: [] });
    } else {
     out.push({ label: fam.label, slug: toSlug(fam.label), children: present.map((m) => ({ label: m, slug: toSlug(m) })) });
    }
   }
   return out;
  })();
 const menuFlat = shopMenu.flatMap((c) => [c, ...c.children]);
 const categoryLabel = category ? menuFlat.find((c) => c.slug === category)?.label || category.replace(/-/g, " ") : null;
 // Only render content sections that actually have content — skip stray image-only
 // sections (a lone full-bleed photo with no headline/text reads as a random "double image").
 const contentSections = sections.filter(
 (s) => ["text", "feature", "gallery"].includes(s.type) && (s.headline || s.text || (s.ctas && s.ctas.length)),
 );
 const newsletter = sections.find((s) => s.type === "newsletter");
 // Preserve the ?preview flag across internal links (so previewing an off
 // storefront doesn't 404 when you click into Shop / a page).
 // On the store's OWN origin its pages ARE the site root — /shop, /philosophy, /p/{id}. The
 // /s/{handle} prefix is how VYA reaches the same storefront internally, and hardcoding it meant
 // every link on a seller's own domain read via-admin.vyasites.com/s/via-admin/shop.
 const base = onOwnOrigin ? "" : `/s/${sf.handle}`;
 const withPreview = (href: string) => (preview ? `${href || "/"}?preview=1` : href || "/");
 const navItems = nav.map((label) => {
 const page = pages.find((p) => p.label?.toLowerCase() === label.toLowerCase());
 const href = page ? `${base}/${page.slug}` : `${base}/shop`;
 return { label, href: withPreview(href) };
 });
 const shopHref = withPreview(`${base}/shop`);
 // Products live on their own Shop page (matching real sites). On the homepage we
 // only show a grid if the cloned page actually had a products section, or if this
 // store has no cloned design at all.
 const isShop = view === "shop";
 const showGrid = isShop || sections.length === 0 || sections.some((s) => s.type === "products");
 // The homepage shows a small "New Arrivals"-style highlight (a few items + a
 // "View all" link); the full catalogue lives on the Shop page.
 //
 // This cap applies ONLY to the legacy grid below — the one a captured/blockless storefront renders.
 // A block-built page must not be truncated here: each featured layout declares how many pieces it
 // shows (grid 8, carousel 12, archive 26 — see app/s/blocks/featured.tsx), and clamping every one of
 // them to 3 meant a seller chose a layout in the builder and shoppers got a different page. Blocks
 // receive the full list and slice it themselves.
 const HOME_HIGHLIGHT = 3;
 const productsSection = sections.find((s) => s.type === "products");
 // A filter that matched nothing falls back to the whole catalogue with a line saying so. This is
 // what makes any category tile safe to ship: an aisle that is empty today reads as "nothing here
 // right now" rather than as a broken link.
 const emptyFiltered = isShop && items.length === 0 && allTiles.length > 0;
 const gridItems = isShop ? (emptyFiltered ? allTiles : items) : items.slice(0, HOME_HIGHLIGHT);
 const blockItems = items;

 // ── Catalogue density ──
 // The Shop grid belongs to the TEMPLATE, not to a section: Vitrine runs two enormous pieces per row
 // and The Index runs five, and that difference is most of what makes them different stores. Classes
 // are looked up from fixed maps rather than built from the value, because Tailwind only ships the
 // classes it can see in the source.
 const shopGrid = theme.shopGrid ?? {};
 const SHOP_COLS: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-3 lg:grid-cols-4",
  5: "sm:grid-cols-3 lg:grid-cols-5",
 };
 const SHOP_RATIO: Record<string, string> = { "4/5": "aspect-[4/5]", "1/1": "aspect-square", "5/6": "aspect-[5/6]", "3/4": "aspect-[3/4]" };
 const SHOP_GUTTER: Record<string, string> = {
  tight: "gap-x-3 gap-y-8 sm:gap-x-4",
  normal: "gap-x-5 gap-y-12 sm:gap-x-8",
  wide: "gap-x-8 gap-y-20 sm:gap-x-14",
 };
 const gridColsCls = isShop ? SHOP_COLS[shopGrid.cols ?? 4] ?? SHOP_COLS[4] : "sm:grid-cols-3";
 const gridGutterCls = SHOP_GUTTER[(isShop && shopGrid.gutter) || "normal"];
 const cardRatioCls = SHOP_RATIO[(isShop && shopGrid.ratio) || "4/5"];

 // VYA-built section layout. When present it replaces the default cloned
 // hero/sections/grid — the seller (or VYA) composes the page from blocks. A
 // pageSlug renders one of the store's extra pages; otherwise the home page.
 const homeBlocks = sanitizeBlocks(theme.blocks ?? []);
 const shopIntro = isShop ? sanitizeBlocks(theme.shopBlocks ?? []) : [];
 const extraPages = sanitizePages(theme.extraPages ?? []);
 const activePage = pageSlug ? extraPages.find((p) => p.slug === pageSlug) : null;
 const blocks = pageSlug ? activePage?.blocks ?? [] : homeBlocks;
 // The store's collections, each with its items, so a product section can show a curated set. Built
 // from the same listings already loaded above — no extra product queries, just membership lookups.
 // Capped because this is one query per collection and a nav menu of forty is not a real design.
 const usedCollectionSlugs = new Set(
  [...blocks, ...shopIntro].map((b) => b.props?.collection).filter((v): v is string => !!v),
 );
 const byId = new Map(items.map((t) => [t.key.replace(/^l/, ""), t]));
 const blockCollections = (await Promise.all(
  // Only the collections a section on this page actually names — one query per USED collection,
  // not per existing one. A store with forty collections shouldn't pay forty queries per page view.
  storeCollections.filter((c) => c.itemCount > 0 && usedCollectionSlugs.has(c.slug)).map(async (c) => ({
   slug: c.slug,
   title: c.title,
   products: (await listCollectionItems(c.id).catch(() => []))
    .map((it) => byId.get(it.id))
    .filter(Boolean)
    .map((t) => ({ key: t!.key, title: t!.title, price: t!.price, image: t!.image, href: t!.itemId ? withPreview(`${base}/p/${t!.itemId}`) : t!.href || undefined })),
  })),
 )).filter((c) => c.products.length > 0);
 const hasBlocks = !isShop && (!!pageSlug || homeBlocks.length > 0);
 // A clean nav for block-based stores: Home · Shop · each collection (with items) · each extra page.
 const collectionNav = storeCollections.filter((c) => c.itemCount > 0).map((c) => ({ label: c.title, href: withPreview(`${base}/collections/${c.slug}`) }));
 // Same links keyed by lowercased title, for the shop-by-category tiles. Built from each
 // collection's own slug (imported stores keep their source handle, so it is not always
 // slugify(title)) and pre-wrapped here so preview mode survives the hop.
 const collectionHrefs: Record<string, string> = Object.fromEntries(
  collectionNav.map((c) => [c.label.trim().toLowerCase(), c.href]),
 );
 const blockNav = homeBlocks.length > 0 || extraPages.length > 0
 ? [{ label: "Home", href: withPreview(`${base}`) }, { label: "Shop", href: shopHref }, ...collectionNav, ...extraPages.map((p) => ({ label: p.title, href: withPreview(`${base}/${p.slug}`) }))]
 : null;
 const finalNav = blockNav ?? navItems;
 // Custom seller-added links merge into the header and/or footer nav (external URLs pass through; internal ones keep the ?preview flag).
 const linkHref = (h: string) => (h.startsWith("/") ? withPreview(h) : h);
 const customLinks = (theme.navLinks ?? []).filter((l) => l.label && l.href);
 const headerNav = [...finalNav, ...customLinks.filter((l) => l.place !== "footer").map((l) => ({ label: l.label, href: linkHref(l.href) }))];
 const footerNav = [...finalNav, ...customLinks.filter((l) => l.place !== "header").map((l) => ({ label: l.label, href: linkHref(l.href) }))];
 const gridHeading = isShop ? collectionTitle || categoryLabel || (query ? `Search: ${query}` : "Shop") : productsSection?.headline || "New Arrivals";
 const heroHeadline = theme.hero?.headline ?? null;
 const heroSub = theme.hero?.subheadline ?? null;
 const heroCta = theme.hero?.ctaLabel ?? null;

 // ── Faithful-render helpers (header chrome, hero, layout-aware sections) ──
 const header = theme.header ?? { announcement: null, hasSearch: false, hasCart: true, hasAccount: false };
 const heroSection = sections.find((s) => s.type === "hero");
 const heroImg = sf.heroImage || heroSection?.image || null;
 const heroAlign = heroSection?.align || "center";
 const heroCtas: { label: string; style: string }[] = heroSection?.ctas?.length ? heroSection.ctas : heroCta ? [{ label: heroCta, style: "primary" }] : [];
 const alignClass = (a: string) => (a === "left" ? "items-start text-left" : a === "right" ? "items-end text-right" : "items-center text-center");
 const justifyClass = (a: string) => (a === "left" ? "justify-start" : a === "right" ? "justify-end" : "justify-center");
 const renderCtas = (ctas: { label: string; style: string }[] | undefined, onDark: boolean, align: string) =>
 ctas && ctas.length ? (
 <div className={"mt-7 flex flex-wrap gap-3 " + justifyClass(align)}>
 {ctas.map((c, i) =>
 c.style === "secondary" ? (
 <a key={i} href={shopHref} className={"px-7 py-2.5 text-[11px] uppercase tracking-[0.18em] transition border " + (onDark ? "border-white/60 text-white hover:bg-white/10" : "border-black/40 hover:bg-black/5")}>
 {c.label}
 </a>
 ) : (
 <a key={i} href={shopHref} className="px-7 py-2.5 text-[11px] uppercase tracking-[0.18em] transition hover:opacity-90" style={{ background: onDark ? "#ffffff" : accent, color: onDark ? "#111111" : "#ffffff" }}>
 {c.label}
 </a>
 ),
 )}
 </div>
 ) : null;

 const storeNameEl = logo ? (
 <img src={logo} alt={storeName} className="mx-auto max-h-16 w-auto object-contain" />
 ) : (
 <h1 className="text-4xl sm:text-5xl" style={{ ...headingStyle, fontFamily: headingStyle.fontFamily || undefined }}>
 {storeName}
 </h1>
 );

 const siteEffects = resolveEffects(theme.effects);
 const storeCode = storefrontScript(theme.customJs, onOwnOrigin);

 return (
 <main style={rootStyle} className="min-h-screen">
 {fontsHref && <link rel="stylesheet" href={fontsHref} />}
 {/* Store's own custom CSS — layered over the theme (targets .vya-* classes). Trusted: only the owner/AI set it. */}
 {theme.customCss && <style dangerouslySetInnerHTML={{ __html: stripThemeBackgroundOverrides(theme.customCss) }} />}

 {/* The store's own code. Only ever on the store's own origin. */}
 {storeCode && <script dangerouslySetInnerHTML={{ __html: storeCode }} />}

 {/* Pointer effects. Mounted only when the store asked for one, so a shop with none ships no
     client component at all. */}
 {hasEffects(siteEffects) && <SiteEffects effects={siteEffects} accent={accent} />}

 {/* Announcement bar */}
 {header.announcement && (
 <div className="px-4 py-2 text-center text-[11px] tracking-wide text-white" style={{ background: accent }}>{header.announcement}</div>
 )}
 {/* Header: brand · nav · utility icons, in the arrangement the seller chose (headerLayout).
     Defined once as three parts so a layout change can never alter what the header CONTAINS —
     only where the parts sit. */}
 {(headerNav.length > 0 || logo) && (() => {
 const brand = (
 <a href={withPreview(`${base}`)} className="shrink-0">
 {logo ? (
 <img src={logo} alt={storeName} className="h-7 w-auto object-contain" />
 ) : (
 <span className="text-lg tracking-[0.12em]" style={headingFont ? { fontFamily: "var(--font-heading)" } : undefined}>{storeName}</span>
 )}
 </a>
 );
 const links = (items: typeof headerNav, extra = "") => (
 <div className={`hidden items-center gap-6 text-[11px] uppercase tracking-[0.16em] opacity-70 md:flex ${extra}`}>

 {headerNav.map((n, i) =>
 /^shop/i.test(n.label) && shopMenu.length ? (
 <div key={i} className="group relative">
 {/* A drawn chevron, not the "⌄" character. That glyph is a text arrowhead: it renders at whatever
     weight and baseline the nav font happens to give it, sits low next to small caps, and looks
     pasted on. This is stroked to match the type's weight and optically centred against it. */}
 <a href={n.href} className="inline-flex items-center gap-1.5 hover:opacity-100">
  {n.label}
  <svg width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true" className="mt-px shrink-0 opacity-60"><path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></svg>
 </a>
 <div className="invisible absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3 opacity-0 transition group-hover:visible group-hover:opacity-100">
 <div className="grid min-w-[210px] gap-0.5 border border-black/10 p-3 shadow-xl" style={{ background: bg }}>
 {/* "Shop all" first — the way back to the full catalogue once you've narrowed it. */}
 <a href={n.href} className="px-2 py-1.5 text-[11px] normal-case tracking-normal hover:opacity-100" style={{ letterSpacing: "normal" }}>Shop all</a>
 {shopMenu.map((c, j) => (
 <div key={j} className="contents">
 {/* The family heading is itself a destination — "Clothing" shows every bucket beneath it. */}
 <a href={withPreview(`${base}/shop?category=${c.slug}`)} className={`px-2 py-1.5 text-[11px] normal-case tracking-normal hover:opacity-100${c.children.length ? " font-medium" : ""}`} style={{ letterSpacing: "normal" }}>{c.label}</a>
 {c.children.map((s, k) => (
 <a key={k} href={withPreview(`${base}/shop?category=${s.slug}`)} className="px-2 py-1 pl-5 text-[11px] normal-case tracking-normal opacity-70 hover:opacity-100" style={{ letterSpacing: "normal" }}>{s.label}</a>
 ))}
 </div>
 ))}
 </div>
 </div>
 </div>
 ) : (
 <a key={i} href={n.href} className="hover:opacity-100">{n.label}</a>
 ),
 )}
  </div>
 );
 const utils = (
 <div className="flex shrink-0 items-center gap-4 opacity-70">
 {/* Search is functional. Account + cart are hidden until VYA has buyer
 logins / a basket (revisit when we build payments) — header.hasAccount /
 header.hasCart are still captured so we can switch them back on. */}
 {header.hasSearch && <SearchBox handle={sf.handle} preview={preview} />}
 </div>
 );
 const bar = "sticky top-0 z-40 border-b border-black/[0.07] px-6 sm:px-8";
 // An odd number of links leans left in the split layout, so the brand stays truly centred.
 const half = Math.ceil(headerNav.length / 2);
 if (headerLayout === "center") return (
 <nav className={`${bar} py-5`} style={{ background: bg }}>
 <div className="flex items-center justify-between gap-4"><span className="w-8 shrink-0" />{brand}{utils}</div>
 {headerNav.length > 0 && <div className="mt-3 flex justify-center">{links(headerNav)}</div>}
 </nav>
 );
 if (headerLayout === "split") return (
 <nav className={`${bar} flex items-center gap-6 py-5`} style={{ background: bg }}>
 {/* The menu halves sit at the OUTER edges, not tucked against the brand — bunched in the middle
     they read as one crowded list with empty gutters either side, which is the opposite of what a
     split header is for. The spacer mirrors the search icon so the brand stays truly centred. */}
 <span className="w-8 shrink-0" />
 {links(headerNav.slice(0, half), "flex-1 justify-start")}
 {brand}
 {links(headerNav.slice(half), "flex-1 justify-end")}
 {utils}
 </nav>
 );
 if (headerLayout === "stacked") return (
 <nav className={`${bar} py-5`} style={{ background: bg }}>
 <div className="flex items-center justify-between gap-4">{brand}{utils}</div>
 {headerNav.length > 0 && <div className="mt-3">{links(headerNav)}</div>}
 </nav>
 );
 return (
 <nav className={`${bar} flex items-center justify-between gap-4 py-5`} style={{ background: bg }}>
 {brand}{links(headerNav)}{utils}
 </nav>
 );
 })()}
 {/* Mobile nav row */}
 {headerNav.length > 0 && (
 <div className="flex items-center gap-5 overflow-x-auto border-b border-black/[0.06] px-6 py-2.5 text-[11px] uppercase tracking-[0.16em] opacity-70 md:hidden">
 {headerNav.map((n, i) => (
 <a key={i} href={n.href} className="whitespace-nowrap">{n.label}</a>
 ))}
 </div>
 )}

 {hasBlocks && (
 <Blocks blocks={blocks} colors={{ bg, text, accent }} fonts={{ heading: headingFont, body: bodyFont }} products={blockItems.map((it) => ({ key: it.key, title: it.title, price: it.price, image: it.image, href: it.itemId ? withPreview(`${base}/p/${it.itemId}`) : it.href || undefined }))} shopHref={shopHref} radius={radius} skin={skin} collections={blockCollections} storeSlug={sf.handle} collectionHrefs={collectionHrefs} />
 )}

 {!hasBlocks && !isShop && (
 <>
 {heroImg && heroHeadline ? (
 /* Cloned hero — headline + buttons over the real photo, honouring its alignment */
 <header className="relative flex min-h-[68vh] w-full overflow-hidden">
 <img src={heroImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
 <div className="absolute inset-0 bg-black/30" />
 <div className={"relative z-10 mx-auto flex w-full max-w-6xl flex-col justify-center px-8 py-24 text-white " + alignClass(heroAlign)}>
 <h1 className="max-w-2xl text-4xl leading-tight sm:text-6xl" style={headingFont ? { fontFamily: "var(--font-heading)" } : { fontFamily: "Georgia, serif" }}>{heroHeadline}</h1>
 {heroSub && <p className="mt-4 max-w-xl text-sm opacity-90 sm:text-base">{heroSub}</p>}
 {renderCtas(heroCtas, true, heroAlign)}
 </div>
 </header>
 ) : sf.heroImage ? (
 <header className="relative h-[42vh] min-h-[280px] w-full overflow-hidden">
 <img src={sf.heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
 <div className="absolute inset-0 bg-black/35" />
 <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-6">
 {logo ? (
 <img src={logo} alt={storeName} className="max-h-16 w-auto object-contain" />
 ) : (
 <h1 className="text-4xl sm:text-5xl" style={headingFont ? { fontFamily: "var(--font-heading)" } : undefined}>{storeName}</h1>
 )}
 {sf.tagline && <p className="mt-3 max-w-xl text-sm sm:text-base opacity-90">{sf.tagline}</p>}
 </div>
 </header>
 ) : (
 <header className="border-b border-black/10">
 <div className="mx-auto max-w-6xl px-6 py-14 text-center">
 <div className="mx-auto mb-5 h-[2px] w-12" style={{ background: "var(--accent)" }} />
 {storeNameEl}
 {sf.tagline && <p className="mt-4 mx-auto max-w-xl text-sm sm:text-base opacity-60">{sf.tagline}</p>}
 {location && <p className="mt-2 text-[11px] uppercase tracking-[0.25em] opacity-40">{location}</p>}
 </div>
 </header>
 )}

 {/* Cloned content sections — each rendered in its real layout/background/alignment */}
 {contentSections.map((s, i) => {
 const onDark = s.background === "dark";
 const sectionStyle: CSSProperties | undefined = onDark
 ? { background: "#161616", color: "#ffffff" }
 : s.background === "accent"
 ? { background: accent, color: "#ffffff" }
 : undefined;
 const headStyle: CSSProperties = { ...(headingFont ? { fontFamily: "var(--font-heading)" } : {}), color: onDark || s.background === "accent" ? "#ffffff" : accent };
 const textAlign = s.align === "left" ? "text-left" : s.align === "right" ? "text-right" : "text-center";

 // Side-by-side image + text
 if ((s.layout === "image-left" || s.layout === "image-right") && s.image) {
 const imgFirst = s.layout === "image-left";
 const img = <img key="i" src={s.image} alt="" className="h-full w-full rounded object-cover" />;
 const copy = (
 <div key="c" className={textAlign}>
 {s.headline && <h2 className="text-2xl sm:text-4xl" style={headStyle}>{s.headline}</h2>}
 {s.text && <p className="mt-4 text-sm leading-relaxed opacity-80 sm:text-base">{s.text}</p>}
 {renderCtas(s.ctas, onDark || s.background === "accent", s.align)}
 </div>
 );
 return (
 <section key={i} className="px-6 py-16 sm:py-20" style={sectionStyle}>
 <div className="mx-auto grid max-w-6xl items-center gap-10 sm:grid-cols-2">{imgFirst ? [img, copy] : [copy, img]}</div>
 </section>
 );
 }

 // Full-bleed image with overlaid text
 if (s.layout === "full-bleed" && s.image) {
 return (
 <section key={i} className="relative flex min-h-[52vh] items-center overflow-hidden px-6 py-20">
 <img src={s.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
 <div className="absolute inset-0 bg-black/45" />
 <div className={"relative z-10 mx-auto flex w-full max-w-5xl flex-col text-white " + alignClass(s.align)}>
 {s.headline && <h2 className="text-3xl sm:text-5xl" style={headingFont ? { fontFamily: "var(--font-heading)" } : undefined}>{s.headline}</h2>}
 {s.text && <p className="mt-4 max-w-xl text-sm opacity-90 sm:text-base">{s.text}</p>}
 {renderCtas(s.ctas, true, s.align)}
 </div>
 </section>
 );
 }

 // Centered / band / text — optional stacked image
 return (
 <section key={i} className="px-6 py-16" style={sectionStyle}>
 <div className={"mx-auto max-w-3xl " + textAlign}>
 {s.headline && <h2 className="text-2xl sm:text-4xl" style={headStyle}>{s.headline}</h2>}
 {s.text && <p className="mt-4 text-sm leading-relaxed opacity-80 sm:text-base">{s.text}</p>}
 {renderCtas(s.ctas, onDark || s.background === "accent", s.align)}
 {s.image && <img src={s.image} alt="" className="mx-auto mt-8 max-h-[60vh] w-full rounded object-cover" />}
 </div>
 </section>
 );
 })}
 </>
 )}

 {/* Editable Shop intro — content the store adds above its catalogue. */}
 {shopIntro.length > 0 && (
 <Blocks blocks={shopIntro} colors={{ bg, text, accent }} fonts={{ heading: headingFont, body: bodyFont }} products={blockItems.map((it) => ({ key: it.key, title: it.title, price: it.price, image: it.image, href: it.itemId ? withPreview(`${base}/p/${it.itemId}`) : it.href || undefined }))} shopHref={shopHref} radius={radius} skin={skin} collections={blockCollections} storeSlug={sf.handle} collectionHrefs={collectionHrefs} />
 )}

 {showGrid && !hasBlocks && (
 <section id="products" className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-24 scroll-mt-4">
 <div className={"mb-12 " + (isShop ? "text-center" : "")}>
 <span className="mb-3 block text-[10px] uppercase tracking-[0.3em] opacity-40">{isShop ? "Catalogue" : "New In"}</span>
 <h2 className="text-3xl capitalize sm:text-[2.6rem] leading-tight" style={headingFont ? { fontFamily: "var(--font-heading)" } : undefined}>{gridHeading}</h2>
 {sf.about && <p className="mt-4 mx-auto max-w-2xl text-sm leading-relaxed opacity-60">{sf.about}</p>}
 </div>

 {emptyFiltered && (
 <p className="mb-10 text-center text-sm opacity-60">
 Nothing in <span className="capitalize">{collectionTitle || categoryLabel || (query ? `“${query}”` : "that")}</span> right now — here’s everything else.
 </p>
 )}
 {gridItems.length === 0 ? (
 <p className="py-24 text-center text-[11px] uppercase tracking-[0.3em] opacity-40">Coming soon</p>
 ) : (
 <div className={`grid grid-cols-2 ${gridGutterCls} ${gridColsCls}`}>
 {gridItems.map((it) => {
 const inner = (
 <>
 <div className={`relative ${cardRatioCls} w-full overflow-hidden bg-black/5` + (it.sold ? " opacity-[0.55]" : "")}>
 {it.image && (
 <img src={it.image} alt={it.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.045]" />
 )}
 {it.sold && (
 <div className="absolute inset-0 flex items-start justify-end p-2">
 <span className="bg-black/80 px-2.5 py-1 text-[9px] uppercase tracking-[0.22em] text-white">Sold</span>
 </div>
 )}
 </div>
 <div className="mt-3.5">
 <p className="line-clamp-1 text-[11px] uppercase tracking-[0.1em] opacity-65">{it.title}</p>
 <p className="mt-1 text-[13px]" style={{ color: it.sold ? "inherit" : "var(--accent)", opacity: it.sold ? 0.45 : 1 }}>{it.price}</p>
 {it.size && <p className="mt-0.5 text-[11px] opacity-40">Size {it.size}</p>}
 </div>
 </>
 );
 const detailHref = it.itemId ? withPreview(`${base}/p/${it.itemId}`) : null;
                return detailHref ? (
                  <a key={it.key} href={detailHref} className="group block">{inner}</a>
                ) : it.href ? (
 <a key={it.key} href={it.href} target="_blank" rel="noopener noreferrer" className="group block">{inner}</a>
 ) : (
 <div key={it.key} className="group block">{inner}</div>
 );
 })}
 </div>
 )}
 {!isShop && items.length > gridItems.length && (
 <div className="mt-12 text-center">
 <a href={shopHref} className="inline-block border px-9 py-3 text-[11px] uppercase tracking-[0.2em] transition hover:opacity-70" style={{ borderColor: accent, color: accent }}>View all</a>
 </div>
 )}
 </section>
 )}

 {!hasBlocks && !isShop && newsletter && (
 <section className="border-t border-black/10 px-6 py-16 text-center">
 <h2 className="text-2xl sm:text-3xl" style={headingFont ? { fontFamily: "var(--font-heading)" } : undefined}>{newsletter.headline || "Join our mailing list"}</h2>
 {newsletter.text && <p className="mt-2 text-sm opacity-70">{newsletter.text}</p>}
 <NewsletterForm accent={accent} />
 </section>
 )}

 <StoreFooter
 storeName={storeName}
 logo={logo}
 nav={footerNav.map((n) => ({ label: n.label, href: n.href }))}
 colors={{ bg, text, accent }}
 headingFontFamily={headingFont ? `'${headingFont}', Georgia, serif` : undefined}
 year={new Date().getFullYear()}
 tagline={[sf.tagline, location].filter(Boolean).join(" · ") || undefined}
 footerAbout={theme.footerAbout || undefined}
 socials={theme.socials}
 newsletter={<NewsletterForm accent={accent} />}
 />
 </main>
 );
}
