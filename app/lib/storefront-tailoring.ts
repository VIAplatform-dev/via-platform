// What a seller sells drives their whole starting storefront. Each category maps to a distinct kit
// (template + palette + font pairing) AND tailored content (hero copy, shop-by-category tiles, marquee
// words). Picking several blends them: the FIRST pick leads the look; tiles + marquee merge across all
// picks — so "streetwear + vintage" lands somewhere genuinely different from "designer luxury".
// Shared by the signup wizard (where the seller picks) and the build wizard (which applies the kit).
import { templateBlocks, STOREFRONT_TEMPLATES, STOREFRONT_PALETTES } from "./storefront-templates";
import type { Block } from "./storefront-blocks";

// The curated font pairings the wizards offer, indexed — a preset's `font` points into this list.
export const TAILOR_FONT_PAIRS = [
 { heading: "Playfair Display", body: "Inter" },
 { heading: "Bodoni Moda", body: "DM Sans" },
 { heading: "Bricolage Grotesque", body: "Inter" },
 { heading: "Fraunces", body: "Source Serif 4" },
 { heading: "Newsreader", body: "Newsreader" },
 { heading: "Cormorant Garamond", body: "Poppins" },
 { heading: "Space Grotesk", body: "Inter" },
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

export const CATEGORY_PRESET: Record<string, CatPreset> = {
 streetwear: { template: "playful-drop", palette: "charcoal", font: 6, hero: { heading: "New heat, curated.", sub: "One-of-one grails and everyday staples — cop them before they’re gone.", cta: "Shop the drop" }, tiles: ["Hoodies", "Tees", "Sneakers", "Outerwear", "Denim", "Headwear"], marquee: ["New drops", "One of one", "Deadstock", "Grails", "Restocked"] },
 designer: { template: "editorial-luxe", palette: "bone-ink", font: 1, hero: { heading: "Designer, authenticated.", sub: "Investment pieces and timeless labels — curated, verified, one of a kind.", cta: "Shop designer" }, tiles: ["Handbags", "Ready-to-wear", "Shoes", "Jewelry", "Outerwear", "Accessories"], marquee: ["Authenticated", "Timeless", "Investment pieces", "Iconic"] },
 vintage: { template: "warm-earthy", palette: "espresso", font: 3, hero: { heading: "Vintage, one of one.", sub: "Hand-picked pieces with history — no restocks, ever.", cta: "Shop vintage" }, tiles: ["Dresses", "Denim", "Knitwear", "Outerwear", "Tees", "Accessories"], marquee: ["One of one", "Hand-picked", "With history", "No restocks"] },
 y2k: { template: "playful-drop", palette: "blush", font: 2, hero: { heading: "Y2K & retro finds.", sub: "The good stuff from the archives — nostalgic, playful, rare.", cta: "Shop the era" }, tiles: ["Tops", "Denim", "Dresses", "Bags", "Shoes", "Accessories"], marquee: ["Y2K", "Retro", "Archive", "Nostalgia", "Rare finds"] },
 denim: { template: "modern-minimal", palette: "dusty-blue", font: 6, hero: { heading: "Denim, done right.", sub: "Vintage washes, perfect fades, one-of-one pairs.", cta: "Shop denim" }, tiles: ["Jeans", "Jackets", "Shorts", "Skirts", "Workwear", "Accessories"], marquee: ["Vintage wash", "Selvedge", "Perfect fades", "One of one"] },
 workwear: { template: "archive-noir", palette: "sage", font: 3, hero: { heading: "Workwear & utility.", sub: "Built-to-last pieces with a story in every seam.", cta: "Shop workwear" }, tiles: ["Jackets", "Trousers", "Overalls", "Shirts", "Boots", "Bags"], marquee: ["Built to last", "Utility", "Heritage", "Rugged"] },
 contemporary: { template: "modern-minimal", palette: "greige", font: 2, hero: { heading: "Considered, contemporary.", sub: "Modern staples and quiet statement pieces.", cta: "Shop the edit" }, tiles: ["New in", "Tops", "Bottoms", "Outerwear", "Shoes", "Accessories"], marquee: ["New in", "Considered", "Everyday", "Quiet luxury"] },
 menswear: { template: "archive-noir", palette: "charcoal", font: 1, hero: { heading: "Menswear, curated.", sub: "Tailoring, staples and standout pieces — edited with intent.", cta: "Shop menswear" }, tiles: ["Shirts", "Tailoring", "Knitwear", "Outerwear", "Denim", "Shoes"], marquee: ["Curated", "Tailored", "Considered", "Standout"] },
 womenswear: { template: "romantic", palette: "blush", font: 5, hero: { heading: "Womenswear, one of one.", sub: "Dresses, knits and finds you won’t see on anyone else.", cta: "Shop womenswear" }, tiles: ["Dresses", "Tops", "Knitwear", "Outerwear", "Bags", "Shoes"], marquee: ["One of one", "Romantic", "Hand-picked", "Timeless"] },
 accessories: { template: "editorial-luxe", palette: "antique-gold", font: 0, hero: { heading: "Accessories & jewelry.", sub: "The finishing pieces — bags, belts, and one-of-a-kind jewels.", cta: "Shop accessories" }, tiles: ["Handbags", "Jewelry", "Belts", "Scarves", "Sunglasses", "Watches"], marquee: ["One of a kind", "Finishing pieces", "Rare", "Curated"] },
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

// Tailor a template's home blocks to what they sell — overriding the hero copy, shop-by-category tiles,
// and marquee words where those sections exist. Keeps the template's layout personality intact.
export function tailoredHome(templateId: string, cats: string[], customs: string[] = []): Block[] {
 const bs = templateBlocks(templateId);
 const primary = primaryPreset(cats);
 if (!primary) return bs;
 const tiles = tailoredTiles(cats, customs);
 const marquee = tailoredMarquee(cats);
 let heroDone = false, tilesDone = false, marqDone = false;
 return bs.map((b) => {
 if (b.type === "hero" && !heroDone) { heroDone = true; return { ...b, props: { ...b.props, heading: primary.hero.heading, subtext: primary.hero.sub, cta: primary.hero.cta } }; }
 if (b.type === "collections" && !tilesDone && tiles.length) { tilesDone = true; return { ...b, props: { ...b.props, items: tiles.join("\n") } }; }
 if (b.type === "marquee" && !marqDone && marquee.length) { marqDone = true; return { ...b, props: { ...b.props, items: marquee.join("\n") } }; }
 return b;
 });
}

// The complete starting design derived from what they sell — template, palette colours, font pairing, and
// tailored home blocks. Used to auto-build a store in one shot (no manual wizard). Falls back to an
// editorial default when nothing was picked.
export function tailoredKit(cats: string[], customs: string[] = []): { template: string; colors: { bg: string; text: string; accent: string }; fonts: { heading: string; body: string }; blocks: Block[] } {
 const primary = primaryPreset(cats);
 const template = primary?.template || "editorial-luxe";
 const tmpl = STOREFRONT_TEMPLATES.find((t) => t.id === template) || STOREFRONT_TEMPLATES[0];
 const colors = (primary && STOREFRONT_PALETTES.find((p) => p.id === primary.palette)?.colors) || tmpl.colors;
 const fonts = primary ? TAILOR_FONT_PAIRS[primary.font] : tmpl.fonts;
 return { template, colors, fonts, blocks: tailoredHome(template, cats, customs) };
}
