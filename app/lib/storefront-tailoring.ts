// What a seller sells drives their whole starting storefront. Each category maps to a distinct kit
// (template + palette + font pairing) AND tailored content (hero copy, shop-by-category tiles, marquee
// words). Picking several blends them: the FIRST pick leads the look; tiles + marquee merge across all
// picks — so "streetwear + vintage" lands somewhere genuinely different from "designer luxury".
// Shared by the signup wizard (where the seller picks) and the build wizard (which applies the kit).
import { templateBlocks, templateShopBlocks, templatePages, templateGrid, getTemplate, STOREFRONT_TEMPLATES, STOREFRONT_PALETTES } from "./storefront-templates";
import type { Block } from "./storefront-blocks";

// The curated font pairings the wizards offer, indexed — a preset's `font` points into this list.
// The first eight ARE the template pairings, in template order, so a preset that picks a template can
// point at its own face rather than landing on a near-miss from a separate list.
export const TAILOR_FONT_PAIRS = [
 { heading: "Cormorant Garamond", body: "Karla" }, // 0 · Heirloom
 { heading: "Spectral", body: "Libre Franklin" }, // 1 · Provenance
 { heading: "Instrument Sans", body: "Instrument Sans" }, // 2 · The Index
 { heading: "Archivo", body: "Archivo" }, // 3 · Drop
 { heading: "Bricolage Grotesque", body: "Newsreader" }, // 4 · Dear Reader
 { heading: "Syne", body: "DM Sans" }, // 5 · Sugar
 { heading: "Schibsted Grotesk", body: "Schibsted Grotesk" }, // 6 · Vitrine
 { heading: "Zilla Slab", body: "Public Sans" }, // 7 · Corner Shop
 // Alternates a seller can reach from the font picker afterwards.
 { heading: "Playfair Display", body: "Inter" }, // 8
 { heading: "Bodoni Moda", body: "DM Sans" }, // 9
 { heading: "Fraunces", body: "Source Serif 4" }, // 10
 { heading: "Newsreader", body: "Newsreader" }, // 11
 { heading: "Space Grotesk", body: "Inter" }, // 12
];

export type CatPreset = { template: string; palette: string; font: number; hero: { heading: string; sub: string; cta: string }; tiles: string[]; marquee: string[] };

export const SELL_CATEGORIES: { key: string; label: string }[] = [
 { key: "vintage", label: "Vintage & archival" },
 { key: "designer", label: "Designer & luxury" },
 { key: "streetwear", label: "Streetwear" },
 { key: "y2k", label: "Y2K & retro" },
 { key: "denim", label: "Denim" },
 { key: "workwear", label: "Workwear & utility" },
 { key: "contemporary", label: "Contemporary" },
 { key: "menswear", label: "Menswear" },
 { key: "womenswear", label: "Womenswear" },
 { key: "accessories", label: "Accessories & jewelry" },
];

// Each category maps to the template whose STRUCTURE fits how that inventory is actually shopped —
// not to the one whose colours look the part. A denim seller has volume, so they get the search-led
// catalogue; a consignment workwear shop is a place before it's a site, so it gets the shop card.
// Two categories may share a template where that is the honest answer; the palette and voice differ.
export const CATEGORY_PRESET: Record<string, CatPreset> = {
 vintage: { template: "elegant", palette: "elegant", font: 0, hero: { heading: "Vintage, one of one.", sub: "Hand-picked pieces with history — no restocks, ever.", cta: "Shop the edit" }, tiles: ["Dresses", "Denim", "Knitwear", "Outerwear", "Tops", "Accessories"], marquee: ["One of one", "Hand-picked", "With history", "No restocks"] },
 designer: { template: "archival", palette: "archival", font: 1, hero: { heading: "Designer, authenticated.", sub: "Investment pieces and documented labels — verified before they're listed.", cta: "Shop all" }, tiles: ["Bags", "Dresses", "Outerwear", "Shoes", "Jewelry", "Accessories"], marquee: ["Authenticated", "Dated to the season", "Documented", "One of one"] },
 menswear: { template: "archival", palette: "bone-ink", font: 9, hero: { heading: "Menswear, curated.", sub: "Tailoring, staples and standout pieces — edited with intent.", cta: "Shop all" }, tiles: ["Shirts", "Outerwear", "Knitwear", "Trousers", "Denim", "Shoes"], marquee: ["Curated", "Tailored", "Considered", "One of one"] },
 denim: { template: "catalogue", palette: "dusty-blue", font: 2, hero: { heading: "[000] pairs. Narrow it down.", sub: "Vintage washes, real fades, every pair one of one.", cta: "Shop all" }, tiles: ["Jeans", "Jackets", "Shorts", "Skirts", "Workwear", "Accessories"], marquee: ["Vintage wash", "Selvedge", "Real fades", "One of one"] },
 streetwear: { template: "bold", palette: "bold", font: 3, hero: { heading: "THE GOOD PIECES DON'T WAIT", sub: "New pieces drop every [DROP DAY] at [TIME] [TZ].", cta: "Shop this drop" }, tiles: ["Outerwear", "Tops", "Shoes", "Denim", "Bags", "Accessories"], marquee: ["New drop", "Deadstock", "Grails", "No restocks"] },
 y2k: { template: "playful", palette: "playful", font: 5, hero: { heading: "everything, all at once", sub: "the good stuff from the archives — nostalgic, loud, one of one.", cta: "shop it" }, tiles: ["going out top", "off duty", "dressed up", "club", "summer", "basics"], marquee: ["y2k", "retro", "archive", "one of one"] },
 womenswear: { template: "editorial", palette: "editorial", font: 4, hero: { heading: "Okay so — you're here", sub: "Dresses, knits and finds you won't see on anyone else.", cta: "Have a look" }, tiles: ["Dresses", "Tops", "Knitwear", "Outerwear", "Bags", "Shoes"], marquee: ["One of one", "Hand-picked", "Mended and measured", "No restocks"] },
 contemporary: { template: "curated", palette: "curated", font: 6, hero: { heading: "Six pieces. That's the edit.", sub: "", cta: "View" }, tiles: ["Tops", "Outerwear", "Dresses", "Trousers", "Shoes", "Accessories"], marquee: ["Considered", "Everyday", "One of one"] },
 accessories: { template: "curated", palette: "antique-gold", font: 8, hero: { heading: "The finishing pieces.", sub: "Bags, belts and one-of-a-kind jewels.", cta: "View" }, tiles: ["Bags", "Jewelry", "Belts", "Scarves", "Sunglasses", "Shoes"], marquee: ["One of a kind", "Finishing pieces", "Rare", "Curated"] },
 workwear: { template: "local", palette: "local", font: 7, hero: { heading: "Built to last, sourced by hand", sub: "Shop online, or come see it in [YOUR NEIGHBOURHOOD].", cta: "Shop online" }, tiles: ["Outerwear", "Trousers", "Shirts", "Denim", "Shoes", "Bags"], marquee: ["Built to last", "Utility", "Heritage", "One of one"] },
};

export const dedupeCI = (a: string[]): string[] => { const seen = new Set<string>(); return a.filter((x) => { const k = x.toLowerCase(); if (!x || seen.has(k)) return false; seen.add(k); return true; }); };

// The first selected category with a known preset leads the look.
export function primaryPreset(cats: string[]): CatPreset | null {
 return cats.map((k) => CATEGORY_PRESET[k]).find(Boolean) || null;
}
export function tailoredTiles(cats: string[], customs: string[] = []): string[] {
 return dedupeCI([...cats.flatMap((k) => CATEGORY_PRESET[k]?.tiles || []), ...customs]).slice(0, 6);
}
export function tailoredMarquee(cats: string[]): string[] {
 return dedupeCI(cats.flatMap((k) => CATEGORY_PRESET[k]?.marquee || [])).slice(0, 8);
}

/**
 * Write what a seller sells into a template's sections — hero copy, category tiles, marquee words —
 * wherever those sections exist. The template's LAYOUT personality is untouched: only copy changes,
 * so a tailored Vitrine is still 2-up and a tailored Drop still leads with the clock.
 *
 * Applied to any block list (home page, Shop intro, or an extra page), because the tiles on a Shop
 * page are the same lie as the tiles on a homepage if they name categories the store doesn't carry.
 */
export function tailorBlocks(blocks: Block[], cats: string[], customs: string[] = []): Block[] {
 const primary = primaryPreset(cats);
 if (!primary) return blocks;
 const tiles = tailoredTiles(cats, customs);
 const marquee = tailoredMarquee(cats);
 let heroDone = false, tilesDone = false, marqDone = false;
 return blocks.map((b) => {
  if (b.type === "hero" && !heroDone) { heroDone = true; return { ...b, props: { ...b.props, heading: primary.hero.heading, subtext: primary.hero.sub, cta: primary.hero.cta } }; }
  // Only the FIRST tile section is rewritten. Provenance carries two on purpose (labels, then eras)
  // and overwriting the era timeline with garment categories would delete its signature move.
  if (b.type === "collections" && !tilesDone && tiles.length) { tilesDone = true; return { ...b, props: { ...b.props, items: tiles.join("\n") } }; }
  if (b.type === "marquee" && !marqDone && marquee.length) { marqDone = true; return { ...b, props: { ...b.props, items: marquee.join("\n") } }; }
  return b;
 });
}

/** Tailor a template's HOME blocks to what they sell. */
export function tailoredHome(templateId: string, cats: string[], customs: string[] = []): Block[] {
 return tailorBlocks(templateBlocks(templateId), cats, customs);
}

/**
 * The complete starting store derived from what they sell — template, palette, font pairing, corner
 * style, header, catalogue density, and every page the template ships with, all tailored. Used to
 * auto-build a store in one shot (no manual wizard).
 *
 * This is the single definition of "apply a template with tailoring"; the signup wizard, the build
 * wizard and the AI generator all go through it so they can't apply three different subsets.
 */
export function tailoredKit(cats: string[], customs: string[] = []) {
 const primary = primaryPreset(cats);
 const template = primary?.template || "elegant";
 const tmpl = getTemplate(template) || STOREFRONT_TEMPLATES[0];
 const colors = (primary && STOREFRONT_PALETTES.find((p) => p.id === primary.palette)?.colors) || tmpl.colors;
 const fonts = primary ? TAILOR_FONT_PAIRS[primary.font] : tmpl.fonts;
 return {
  template: tmpl.id,
  colors,
  fonts,
  radius: tmpl.radius,
  headerLayout: tmpl.headerLayout,
  shopGrid: templateGrid(tmpl.id),
  blocks: tailorBlocks(templateBlocks(tmpl.id), cats, customs),
  shopBlocks: tailorBlocks(templateShopBlocks(tmpl.id), cats, customs),
  extraPages: templatePages(tmpl.id).map((p) => ({ ...p, blocks: tailorBlocks(p.blocks, cats, customs) })),
 };
}
