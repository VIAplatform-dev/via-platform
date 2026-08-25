/* eslint-disable @next/next/no-img-element */
// ─────────────────────────────────────────────────────────────────────────────
// Template gallery — every storefront template, every page, rendered through the
// REAL Blocks renderer at the template's real palette, type, corners and grid.
//
// No database: sample products stand in for a catalogue, so this shows the
// LAYOUT decisions (which sections, in which variant, at what density) without
// touching a store. That's the thing the studio's picker can't show and the
// mockups can't keep in sync — this is generated from storefront-templates.ts,
// so it can never drift from what a seller actually gets.
// ─────────────────────────────────────────────────────────────────────────────
import type { CSSProperties } from "react";
import Blocks, { type BlockProduct } from "@/app/s/Blocks";
import { StoreHeader, StoreFooter, type ChromeNav } from "@/app/s/StoreChrome";
import {
 STOREFRONT_TEMPLATES,
 getTemplate,
 templateBlocks,
 templateShopBlocks,
 templatePages,
 storefrontFontsHref,
 ALL_STOREFRONT_FONTS,
} from "@/app/lib/storefront-templates";
import type { Block } from "@/app/lib/storefront-blocks";

export const dynamic = "force-dynamic";

// Placeholder imagery. Served from ./img as a plain URL rather than a data: URI — several block
// types split their image list on commas as well as newlines (ITEM_SCHEMAS `loose`), and every data
// URI contains a comma, so each one arrived as two broken fragments.
const placeholder = (ink: string, bg: string, i: number) =>
 `/s/templates/img?ink=${ink.replace("#", "")}&bg=${bg.replace("#", "")}&i=${i}`;

// Titles follow the formula the copy study found on every store worth copying — brand, era,
// material, garment, size — because card anatomy is part of what's being reviewed: how a long title
// wraps at 5-up versus 2-up is a real difference between these templates.
const TITLES = [
 "Christian Dior F/W 1998 Croc-Embossed Pump — US 8",
 "Chanel 1994 Quilted Lambskin Flap Bag",
 "Chanel Cruise 2000 Printed Silk Top — S",
 "Christian Dior Leather Ballet Flat — US 8",
 "Fendi 1999 Beaded Baguette",
 "Gucci Tom Ford Era Leather Heel — US 7",
 "Christian Dior Patent Slingback — US 7.5",
 "Louis Vuitton Monogram Mini Speedy",
 "Ralph Lauren Hand-Knit Wool Cardigan — M",
 "Mulberry Darwin Leather Bayswater",
 "Gucci S/S 2004 Asymmetric Jersey Top — S",
 "Christian Dior Kitten Heel Mule — US 8.5",
];
const PRICES = ["$460", "$2,000", "$650", "$510", "$4,000", "$425", "$590", "$1,800", "$165", "$780", "$325", "$700"];

const sampleProducts = (ink: string, bg: string): BlockProduct[] =>
 TITLES.map((title, i) => ({ key: String(i + 1), title, price: PRICES[i], image: placeholder(ink, bg, i) }));

// Templates ship every image field EMPTY on purpose — a starter store must never arrive carrying
// stock photography a seller has to hunt down and delete. For a gallery that hides the composition,
// so fill the blanks here and only here.
//
// Multi-image sections get FOUR photos, not eight. A seller fills a gallery with a considered set;
// eight identical blanks stacked under six product blanks is what turned a lookbook section into
// "rows of grey boxes" and made the whole page unreadable as a design.
// Hero layouts that are BUILT around a photograph. The others — `stack` above all — are type-first
// by design: Heirloom opens on words on paper and Vitrine on a single centred line, and both ship
// with no hero image on purpose. Filling those in put a full-bleed photo directly above the
// full-bleed image band that follows, which is why the top of the page read as two giant pictures
// stacked on each other. A template that means to open on type should preview that way.
const PHOTO_HEROES = new Set(["bleed", "split", "frame", "slides"]);

function withPlaceholders(blocks: Block[], ink: string, bg: string): Block[] {
 let n = 0;
 const next = () => placeholder(ink, bg, n++);
 return blocks.map((b) => {
  const props = { ...b.props };
  const skipHero = b.type === "hero" && !PHOTO_HEROES.has(b.variant || "");
  if ("image" in props && !props.image && !skipHero) props.image = next();
  // Six, not four. The galleries are three- and four-column grids, so four photos leave exactly one
 // stranded on its own row — which reads as a broken layout rather than a lookbook, especially when
 // every tile is an identical grey blank. Six fills two clean rows of three, and fills the
 // four-column `loose` variant's row-spanning composition completely.
 if ("images" in props && !props.images) props.images = Array.from({ length: 6 }, next).join("\n");
  return { ...b, props };
 });
}

// The same maps the live Shop page uses (app/s/StorefrontView.tsx) — kept identical so this preview
// shows the real density rather than an approximation of it.
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

type Props = { searchParams: Promise<{ t?: string; p?: string }> };

export default async function TemplateGallery({ searchParams }: Props) {
 const { t: tid, p: pageSlug = "home" } = await searchParams;
 const tpl = getTemplate(tid || "") || STOREFRONT_TEMPLATES[0];
 const pages = templatePages(tpl.id);

 const c = { bg: tpl.colors.bg, text: tpl.colors.text, accent: tpl.colors.accent };
 const headingFF = `'${tpl.fonts.heading}', Georgia, serif`;
 const bodyFF = `'${tpl.fonts.body}', system-ui, sans-serif`;

 const href = (id: string, slug: string) => `/s/templates?t=${id}&p=${slug}`;
 const nav: ChromeNav[] = [
  { label: "Home", href: href(tpl.id, "home"), active: pageSlug === "home" },
  { label: "Shop", href: href(tpl.id, "shop"), active: pageSlug === "shop" },
  ...pages.map((p) => ({ label: p.title, href: href(tpl.id, p.slug), active: pageSlug === p.slug })),
 ];

 const isShop = pageSlug === "shop";
 const products = sampleProducts(c.text, c.bg);
 const blocks = withPlaceholders(
  pageSlug === "home" ? templateBlocks(tpl.id)
  : isShop ? templateShopBlocks(tpl.id)
  : pages.find((p) => p.slug === pageSlug)?.blocks ?? templateBlocks(tpl.id),
  c.text,
  c.bg,
 );

 // The announcement block is a full-width strip the template puts above its own header, so it has to
 // render before the chrome rather than inside the page body — same as the live storefront.
 const strip = blocks.find((b) => b.type === "announcement");
 const body = blocks.filter((b) => b !== strip);

 const root = { background: c.bg, color: c.text, fontFamily: bodyFF, "--accent": c.accent } as CSSProperties;

 return (
 <div className="min-h-screen bg-[#1a1a1a]">
  <link rel="stylesheet" href={storefrontFontsHref(ALL_STOREFRONT_FONTS)} />

  {/* ── Gallery chrome. Deliberately dark and outside the storefront, so nothing here can be
      mistaken for part of the template being reviewed. ─────────────────────────────────── */}
  <div className="sticky top-0 z-[100] border-b border-white/10 bg-[#1a1a1a]/95 backdrop-blur">
   <div className="flex flex-wrap items-center gap-x-1 gap-y-1 px-4 py-2.5">
    <span className="mr-3 text-[10px] uppercase tracking-[0.2em] text-white/35">Templates</span>
    {STOREFRONT_TEMPLATES.map((x) => (
     <a
      key={x.id}
      href={href(x.id, "home")}
      className={`rounded-full px-3 py-1 text-[12px] transition ${x.id === tpl.id ? "bg-white text-black" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
     >
      {x.name}
     </a>
    ))}
   </div>
   <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-white/[0.07] px-4 py-2">
    <span className="mr-3 text-[10px] uppercase tracking-[0.2em] text-white/35">Pages</span>
    {nav.map((n) => (
     <a
      key={n.href}
      href={n.href}
      className={`rounded-full px-3 py-1 text-[12px] transition ${n.active ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/10 hover:text-white"}`}
     >
      {n.label}
     </a>
    ))}
    <span className="ml-auto font-mono text-[11px] text-white/35">
     {tpl.grid.cols}-up · {tpl.grid.ratio} · {tpl.grid.gutter} gutters · {tpl.radius} corners · {tpl.productLayout} product page
    </span>
   </div>
   <p className="border-t border-white/[0.07] px-4 py-2 text-[12px] leading-relaxed text-white/45">
    <span className="text-white/70">{tpl.bestFor}</span> — {tpl.signature}
   </p>
  </div>

  {/* ── The template itself ──────────────────────────────────────────────────────────────── */}
  <main style={root}>
   {strip && (
    <Blocks blocks={[strip]} colors={c} fonts={tpl.fonts} products={products} shopHref={href(tpl.id, "shop")} radius={tpl.radius} storeSlug="preview" />
   )}
   <StoreHeader
    storeName="YOUR STORE"
    nav={nav}
    colors={c}
    headingFontFamily={headingFF}
    layout={tpl.headerLayout}
   />

   {body.length > 0 && (
    <Blocks blocks={body} colors={c} fonts={tpl.fonts} products={products} shopHref={href(tpl.id, "shop")} radius={tpl.radius} storeSlug="preview" />
   )}

   {/* The Shop page is its intro sections above the store's whole catalogue, at the template's
       own density. This is the clearest single difference between the eight. */}
   {isShop && (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
     <div className="mb-12 text-center">
      <span className="mb-3 block text-[10px] uppercase tracking-[0.3em] opacity-40">Catalogue</span>
      <h2 className="text-3xl leading-tight sm:text-[2.6rem]" style={{ fontFamily: headingFF }}>Shop</h2>
     </div>
     <div className={`grid grid-cols-2 ${SHOP_GUTTER[tpl.grid.gutter]} ${SHOP_COLS[tpl.grid.cols]}`}>
      {products.map((it) => (
       <div key={it.key} className="group block">
        <div className={`relative ${SHOP_RATIO[tpl.grid.ratio]} w-full overflow-hidden bg-black/5`}>
         <img src={it.image} alt={it.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.045]" />
        </div>
        <div className="mt-3.5">
         <p className="line-clamp-1 text-[11px] uppercase tracking-[0.1em] opacity-65">{it.title}</p>
         <p className="mt-1 text-[13px]" style={{ color: c.accent }}>{it.price}</p>
        </div>
       </div>
      ))}
     </div>
    </section>
   )}

   <StoreFooter
    storeName="YOUR STORE"
    nav={nav}
    colors={c}
    headingFontFamily={headingFF}
    year={2026}
    tagline="[Your tagline] · [Your city]"
   />
  </main>
 </div>
 );
}
