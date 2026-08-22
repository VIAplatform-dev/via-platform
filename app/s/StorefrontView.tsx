/* eslint-disable @next/next/no-img-element */
import type { CSSProperties } from "react";
import { stores } from "@/app/lib/stores";
import SearchBox from "./SearchBox";
import { loadStoreProducts } from "@/app/lib/loadStoreProducts";
import { getListingsByStore, type Listing } from "@/app/lib/listings-db";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getCollectionBySlug, listCollectionItems, listCollections } from "@/app/lib/db/collections";
import { formatPrice } from "@/app/lib/formatPrice";
import type { StorefrontSettings } from "@/app/lib/storefront-db";
import NewsletterForm from "./NewsletterForm";
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
 const matchesCat = (l: Listing) => {
 const f = catFields(l);
 if (f.some((t) => toSlug(t) === catSlug)) return true; // exact collection membership
 const t = f.map((x) => x.toLowerCase().replace(/s$/, ""));
 return catWords.some((w) => t.some((tag) => tag.includes(w) || w.includes(tag)));
 };
 const q = (query || "").trim().toLowerCase();
 const shownListings = sortedListings
 .filter((l) => (collectionIds ? collectionIds.has(l.id) : true))
 .filter((l) => (category && catWords.length ? matchesCat(l) : true))
 .filter((l) => (q ? l.title.toLowerCase().includes(q) || catFields(l).some((t) => t.toLowerCase().includes(q)) : true));
 const items: Tile[] = listings.length
 ? shownListings.map((l) => ({ key: `l${l.id}`, title: l.title, price: formatPrice(l.price, l.currency), image: l.images[0] || "", size: l.size, href: null, itemId: l.status !== "sold" ? l.id : undefined, sold: l.status === "sold" }))
 : products.map((p) => ({ key: p.id, title: p.name, price: fmtPrice(p.price), image: p.image || p.images?.[0] || "", size: p.size ?? null, href: p.externalUrl || null }));

 // ── Theme ──
 const theme = sf.theme || {};
 // Headings/buttons/prices follow the site's own ink (its text colour) — the
 // extracted "accent" is often a spurious CSS colour (e.g. a sale-tag red), so the
 // text colour is the reliable match. Falls back to the accent, then VYA's.
 const accent = theme.colors?.text || theme.colors?.accent || sf.accentColor || "#5D0F17";
 const bg = theme.colors?.bg || "#FFFDF8";
 const text = theme.colors?.text || "#241c17";
 const headingFont = theme.fonts?.heading;
 const bodyFont = theme.fonts?.body;
 const radius = theme.radius || "sharp"; // global corner style ("shapes")
 const skin = theme.skin || undefined; // global style skin (type scale, spacing, button shape)
 const logo = theme.logo || null;

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
 const categoryLabel = category ? categories.find((c) => c.slug === category)?.label || category.replace(/-/g, " ") : null;
 // Only render content sections that actually have content — skip stray image-only
 // sections (a lone full-bleed photo with no headline/text reads as a random "double image").
 const contentSections = sections.filter(
 (s) => ["text", "feature", "gallery"].includes(s.type) && (s.headline || s.text || (s.ctas && s.ctas.length)),
 );
 const newsletter = sections.find((s) => s.type === "newsletter");
 // Preserve the ?preview flag across internal links (so previewing an off
 // storefront doesn't 404 when you click into Shop / a page).
 const withPreview = (href: string) => (preview ? `${href}?preview=1` : href);
 const navItems = nav.map((label) => {
 const page = pages.find((p) => p.label?.toLowerCase() === label.toLowerCase());
 const href = page ? `/s/${sf.handle}/${page.slug}` : `/s/${sf.handle}/shop`;
 return { label, href: withPreview(href) };
 });
 const shopHref = withPreview(`/s/${sf.handle}/shop`);
 // Products live on their own Shop page (matching real sites). On the homepage we
 // only show a grid if the cloned page actually had a products section, or if this
 // store has no cloned design at all.
 const isShop = view === "shop";
 const showGrid = isShop || sections.length === 0 || sections.some((s) => s.type === "products");
 // The homepage shows a small "New Arrivals"-style highlight (a few items + a
 // "View all" link); the full catalogue lives on the Shop page.
 const HOME_HIGHLIGHT = 3;
 const productsSection = sections.find((s) => s.type === "products");
 const gridItems = isShop ? items : items.slice(0, HOME_HIGHLIGHT);
 // VYA-built section layout. When present it replaces the default cloned
 // hero/sections/grid — the seller (or VYA) composes the page from blocks. A
 // pageSlug renders one of the store's extra pages; otherwise the home page.
 const homeBlocks = sanitizeBlocks(theme.blocks ?? []);
 const shopIntro = isShop ? sanitizeBlocks(theme.shopBlocks ?? []) : [];
 const extraPages = sanitizePages(theme.extraPages ?? []);
 const activePage = pageSlug ? extraPages.find((p) => p.slug === pageSlug) : null;
 const blocks = pageSlug ? activePage?.blocks ?? [] : homeBlocks;
 const hasBlocks = !isShop && (!!pageSlug || homeBlocks.length > 0);
 // A clean nav for block-based stores: Home · Shop · each collection (with items) · each extra page.
 const collectionNav = storeCollections.filter((c) => c.itemCount > 0).map((c) => ({ label: c.title, href: withPreview(`/s/${sf.handle}/collections/${c.slug}`) }));
 const blockNav = homeBlocks.length > 0 || extraPages.length > 0
 ? [{ label: "Home", href: withPreview(`/s/${sf.handle}`) }, { label: "Shop", href: shopHref }, ...collectionNav, ...extraPages.map((p) => ({ label: p.title, href: withPreview(`/s/${sf.handle}/${p.slug}`) }))]
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

 return (
 <main style={rootStyle} className="min-h-screen">
 {fontsHref && <link rel="stylesheet" href={fontsHref} />}
 {/* Store's own custom CSS — layered over the theme (targets .vya-* classes). Trusted: only the owner/AI set it. */}
 {theme.customCss && <style dangerouslySetInnerHTML={{ __html: stripThemeBackgroundOverrides(theme.customCss) }} />}

 {/* Announcement bar */}
 {header.announcement && (
 <div className="px-4 py-2 text-center text-[11px] tracking-wide text-white" style={{ background: accent }}>{header.announcement}</div>
 )}
 {/* Header: logo · nav · utility icons */}
 {(headerNav.length > 0 || logo) && (
 <nav className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-black/[0.07] px-6 sm:px-8 py-5" style={{ background: bg }}>
 <a href={withPreview(`/s/${sf.handle}`)} className="shrink-0">
 {logo ? (
 <img src={logo} alt={storeName} className="h-7 w-auto object-contain" />
 ) : (
 <span className="text-lg tracking-[0.12em]" style={headingFont ? { fontFamily: "var(--font-heading)" } : undefined}>{storeName}</span>
 )}
 </a>
 <div className="hidden items-center gap-6 text-[11px] uppercase tracking-[0.16em] opacity-70 md:flex">
 {headerNav.map((n, i) =>
 /^shop/i.test(n.label) && categories.length ? (
 <div key={i} className="group relative">
 <a href={n.href} className="hover:opacity-100">{n.label} ⌄</a>
 <div className="invisible absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3 opacity-0 transition group-hover:visible group-hover:opacity-100">
 <div className="grid min-w-[210px] gap-0.5 border border-black/10 p-3 shadow-xl" style={{ background: bg }}>
 {categories.map((c, j) => (
 <a key={j} href={withPreview(`/s/${sf.handle}/shop?category=${c.slug}`)} className="px-2 py-1.5 text-[11px] normal-case tracking-normal hover:opacity-100" style={{ letterSpacing: "normal" }}>{c.label}</a>
 ))}
 </div>
 </div>
 </div>
 ) : (
 <a key={i} href={n.href} className="hover:opacity-100">{n.label}</a>
 ),
 )}
 </div>
 <div className="flex shrink-0 items-center gap-4 opacity-70">
 {/* Search is functional. Account + cart are hidden until VYA has buyer
 logins / a basket (revisit when we build payments) — header.hasAccount /
 header.hasCart are still captured so we can switch them back on. */}
 {header.hasSearch && <SearchBox handle={sf.handle} preview={preview} />}
 </div>
 </nav>
 )}
 {/* Mobile nav row */}
 {headerNav.length > 0 && (
 <div className="flex items-center gap-5 overflow-x-auto border-b border-black/[0.06] px-6 py-2.5 text-[11px] uppercase tracking-[0.16em] opacity-70 md:hidden">
 {headerNav.map((n, i) => (
 <a key={i} href={n.href} className="whitespace-nowrap">{n.label}</a>
 ))}
 </div>
 )}

 {hasBlocks && (
 <Blocks blocks={blocks} colors={{ bg, text, accent }} fonts={{ heading: headingFont, body: bodyFont }} products={gridItems.map((it) => ({ key: it.key, title: it.title, price: it.price, image: it.image, href: it.itemId ? withPreview(`/s/${sf.handle}/p/${it.itemId}`) : it.href || undefined }))} shopHref={shopHref} radius={radius} skin={skin} storeSlug={sf.handle} />
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
 <Blocks blocks={shopIntro} colors={{ bg, text, accent }} fonts={{ heading: headingFont, body: bodyFont }} products={gridItems.map((it) => ({ key: it.key, title: it.title, price: it.price, image: it.image, href: it.itemId ? withPreview(`/s/${sf.handle}/p/${it.itemId}`) : it.href || undefined }))} shopHref={shopHref} radius={radius} skin={skin} storeSlug={sf.handle} />
 )}

 {showGrid && !hasBlocks && (
 <section id="products" className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-24 scroll-mt-4">
 <div className={"mb-12 " + (isShop ? "text-center" : "")}>
 <span className="mb-3 block text-[10px] uppercase tracking-[0.3em] opacity-40">{isShop ? "Catalogue" : "New In"}</span>
 <h2 className="text-3xl capitalize sm:text-[2.6rem] leading-tight" style={headingFont ? { fontFamily: "var(--font-heading)" } : undefined}>{gridHeading}</h2>
 {sf.about && <p className="mt-4 mx-auto max-w-2xl text-sm leading-relaxed opacity-60">{sf.about}</p>}
 </div>

 {gridItems.length === 0 ? (
 <p className="py-24 text-center text-[11px] uppercase tracking-[0.3em] opacity-40">Coming soon</p>
 ) : (
 <div className={"grid gap-x-5 gap-y-12 grid-cols-2 sm:gap-x-8 " + (isShop ? "sm:grid-cols-3 lg:grid-cols-4" : "sm:grid-cols-3")}>
 {gridItems.map((it) => {
 const inner = (
 <>
 <div className={"relative aspect-[4/5] w-full overflow-hidden bg-black/5" + (it.sold ? " opacity-[0.55]" : "")}>
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
 const detailHref = it.itemId ? withPreview(`/s/${sf.handle}/p/${it.itemId}`) : null;
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
