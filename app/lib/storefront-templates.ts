// Storefront starter templates — each is a COMPLETE vibe: a palette, a font pairing, AND a
// tasteful starter layout built from the section types. Picking one restyles the store and lays
// out a real home page the seller can then edit or ask VYA to change. Grounded in real VYA stores.

import { makeBlock, type Block, type BlockType, type BlockStyle } from "./storefront-blocks.ts";

export type HeroStyle = "carousel" | "text-over-image" | "logo-masthead" | "drop-banner" | "minimal";
type Spec = { type: BlockType; props?: Record<string, string>; style?: BlockStyle };

export type StorefrontTemplate = {
 id: string;
 name: string;
 description: string;
 colors: { bg: string; text: string; accent: string };
 fonts: { heading: string; body: string };
 heroStyle: HeroStyle;
 layout: Spec[]; // starter home-page sections
};

export const STOREFRONT_TEMPLATES: StorefrontTemplate[] = [
 {
 id: "editorial-luxe",
 name: "Editorial Luxe",
 description: "Warm bone and ink with a high-contrast fashion-magazine serif. The premium boutique look.",
 colors: { bg: "#F4F0E8", text: "#1C1814", accent: "#2A2521" },
 fonts: { heading: "Playfair Display", body: "Inter" },
 heroStyle: "carousel",
 layout: [
 { type: "announcement", props: { text: "Complimentary shipping on orders over $150" } },
 { type: "hero", props: { heading: "The New Arrivals", subtext: "Curated vintage, one piece at a time.", cta: "Shop the edit" } },
 { type: "featured", props: { heading: "The Edit" } },
 { type: "split", props: { heading: "Sourced, not stocked", body: "Every piece is found, authenticated, and photographed by hand — never mass-listed.", cta: "Our story", imageSide: "left" } },
 { type: "testimonials", props: { heading: "What our clients say", items: "Exactly as described — the quality is incredible. | Maya R.\nMy new favourite shop; everything is one of one. | Priya S.\nBeautifully packaged and shipped fast. | Jordan T." } },
 { type: "newsletter", props: { heading: "Join the list", subtext: "First look at every new arrival." } },
 ],
 },
 {
 id: "archive-noir",
 name: "Archive Noir",
 description: "Bone and oxblood with a bold grotesque display and dark editorial sections. Moody and archival.",
 colors: { bg: "#ECE4D6", text: "#201811", accent: "#6C2126" },
 fonts: { heading: "Fraunces", body: "Inter" },
 heroStyle: "text-over-image",
 layout: [
 { type: "hero", props: { heading: "Only ever made once.", subtext: "Archival & designer vintage — sourced, authenticated, never restocked.", cta: "Enter the archive" }, style: { bg: "dark" } },
 { type: "marquee", props: { items: "Cavalli\nMugler\nBlumarine\nTom Ford\nGaultier\nVersace" } },
 { type: "collections", props: { heading: "Shop by designer", items: "Cavalli\nMugler\nTom Ford\nVersace\nBlumarine\nGaultier" } },
 { type: "featured", props: { heading: "New to the archive" } },
 { type: "split", props: { heading: "Authenticated by hand", body: "Every piece is examined against archive references and dated to its season. When it sells, it’s gone.", cta: "How we authenticate", imageSide: "left" } },
 { type: "statement", props: { quote: "When a piece is gone, it belongs to whoever moved first." }, style: { bg: "dark" } },
 { type: "newsletter", props: { heading: "First look at every drop", subtext: "Members see it before it’s public." } },
 ],
 },
 {
 id: "modern-minimal",
 name: "Modern Minimal",
 description: "Soft ivory with a contemporary grotesque. Lets the product photography do the talking.",
 colors: { bg: "#FAF7F0", text: "#1B1813", accent: "#1B1813" },
 fonts: { heading: "Bricolage Grotesque", body: "Inter" },
 heroStyle: "minimal",
 layout: [
 { type: "hero", props: { heading: "Less, but better.", subtext: "A tight edit of considered vintage.", cta: "Shop" } },
 { type: "collections", props: { heading: "Browse", items: "Tops\nOuterwear\nDenim\nKnitwear\nAccessories\nShoes" } },
 { type: "featured", props: { heading: "In stock" } },
 { type: "testimonials", props: { heading: "★ 4.9 from 200+ shoppers", items: "Clean, honest listings and quick shipping. | Alex M.\nEvery piece is exactly my style. | Sam K.\nThe edit is unmatched. | Robin D." } },
 { type: "newsletter", props: { heading: "Stay in the loop", subtext: "New drops, no noise." } },
 ],
 },
 {
 id: "literary-archive",
 name: "Literary Archive",
 description: "Soft white and an all-serif, book-like feel. Atmospheric and story-forward.",
 colors: { bg: "#FAF7F1", text: "#1A1611", accent: "#5E4632" },
 fonts: { heading: "Newsreader", body: "Newsreader" },
 heroStyle: "text-over-image",
 layout: [
 { type: "hero", props: { heading: "An archive of the worn and wonderful", subtext: "Stories you can wear.", cta: "Enter" } },
 { type: "text", props: { heading: "On collecting", body: "A few lines about what you look for, and why it matters. Set the tone before the pieces speak for themselves." } },
 { type: "featured", props: { heading: "Recent finds" } },
 { type: "spotlight", props: { heading: "Piece of the week", subtext: "A closer look at one find worth the story.", cta: "See the piece" } },
 { type: "statement", props: { quote: "Every garment carries a life before yours." }, style: { bg: "accent" } },
 { type: "newsletter", props: { heading: "The dispatch", subtext: "Notes and new arrivals, occasionally." } },
 ],
 },
 {
 id: "romantic",
 name: "Romantic",
 description: "Blush and mauve with an elegant Garamond headline. Soft and feminine.",
 colors: { bg: "#F3EAE3", text: "#2A222A", accent: "#8C6A74" },
 fonts: { heading: "Cormorant Garamond", body: "Poppins" },
 heroStyle: "text-over-image",
 layout: [
 { type: "announcement", props: { text: "New pieces added every Friday" } },
 { type: "hero", props: { heading: "Softly, beautifully worn", subtext: "Romantic vintage for every day.", cta: "Shop now" } },
 { type: "split", props: { heading: "Chosen with love", body: "Each piece is picked for its charm and cared for before it reaches you.", cta: "Our story", imageSide: "left" } },
 { type: "featured", props: { heading: "Just in" } },
 { type: "testimonials", props: { heading: "From our community", items: "The prettiest pieces and the sweetest packaging. | Elena V.\nI get compliments every time I wear them. | Noor A.\nFelt like a gift to myself. | Grace L." } },
 { type: "newsletter", props: { heading: "Join us", subtext: "First dibs on new treasures." } },
 ],
 },
 {
 id: "warm-earthy",
 name: "Warm Earthy",
 description: "Warm cream with a terracotta accent and a soft serif. Eclectic and sun-faded.",
 colors: { bg: "#F2E7DA", text: "#372620", accent: "#B15E37" },
 fonts: { heading: "Fraunces", body: "DM Sans" },
 heroStyle: "logo-masthead",
 layout: [
 { type: "hero", props: { heading: "Sun-faded & one of a kind", subtext: "Eclectic vintage, warmly worn.", cta: "Shop the collection" } },
 { type: "collections", props: { heading: "Find your thing", items: "Denim\nLeather\nWorkwear\nBoho\nWestern\nKnitwear" } },
 { type: "featured", props: { heading: "The collection" } },
 { type: "split", props: { heading: "Every piece has a past", body: "Sourced from markets and estates, cleaned and readied by hand for its next life.", cta: "Our story", imageSide: "right" } },
 { type: "testimonials", props: { heading: "Happy finds", items: "Such unique pieces — I always find a gem. | Dana P.\nWarm, honest shop with great taste. | Theo N.\nMy go-to for one-of-a-kind. | Remy C." } },
 { type: "newsletter", props: { heading: "Come along", subtext: "New finds, straight to your inbox." } },
 ],
 },
 {
 id: "playful-drop",
 name: "Playful Drop",
 description: "Soft ivory with one raspberry accent and a drop banner. Young and confident.",
 colors: { bg: "#FBF8F1", text: "#141110", accent: "#D6455E" },
 fonts: { heading: "Space Grotesk", body: "Inter" },
 heroStyle: "drop-banner",
 layout: [
 { type: "announcement", props: { text: "★ NEW DROP FRIDAY 6PM — DON’T SLEEP ★" } },
 { type: "hero", props: { heading: "Fresh drops, zero repeats", subtext: "One-of-one, gone when they’re gone.", cta: "Shop the drop" } },
 { type: "featured", props: { heading: "This week" } },
 { type: "collections", props: { heading: "Dig in", items: "Y2K\nStreetwear\nGraphic tees\nDenim\nOuterwear\nRare" } },
 { type: "marquee", props: { items: "Y2K\nStreetwear\nGraphic tees\nArchive\nRare\nGrails" } },
 { type: "testimonials", props: { heading: "The hype is real", items: "Copped a grail, packaging was fire. | Kai\nBest drops in the game. | Mars\nNever miss a Friday now. | Devon" } },
 { type: "newsletter", props: { heading: "Get the drop alert", subtext: "Be first. Every time." } },
 ],
 },
];

export function getTemplate(id: string): StorefrontTemplate | undefined {
 return STOREFRONT_TEMPLATES.find((t) => t.id === id);
}

/** Fresh starter blocks for a template (new ids each time), ready to drop into a page. */
export function templateBlocks(id: string): Block[] {
 const t = getTemplate(id);
 if (!t) return [];
 return t.layout.map((s) => {
 const b = makeBlock(s.type, s.props);
 if (s.style) b.style = s.style;
 return b;
 });
}

// Curated fonts a store can swap to (Google Fonts — the storefront loads them by name). Kept to
// families that carry the 400/500/600/700 weights the loader requests, so no combination 400-errors.
export const HEADING_FONTS = [
 // Serif & display-serif — the fashion-editorial voice
 "Playfair Display", "Bodoni Moda", "Cormorant Garamond", "EB Garamond", "Newsreader", "Fraunces",
 "Lora", "Spectral", "Crimson Pro", "Source Serif 4", "Bitter", "Literata", "Domine",
 // Sans & grotesque — modern, clean
 "Outfit", "Space Grotesk", "Archivo", "Montserrat", "Jost", "Syne", "Sora", "Bricolage Grotesque",
 "Epilogue", "Unbounded", "Poppins", "DM Sans", "Manrope", "Raleway", "Libre Franklin", "Chivo",
];
export const BODY_FONTS = [
 "Inter", "Newsreader", "Poppins", "Montserrat", "Figtree", "Outfit", "Work Sans", "Nunito Sans",
 "Roboto", "DM Sans", "Manrope", "Hanken Grotesk", "Lexend", "Plus Jakarta Sans", "Public Sans",
 "Karla", "Mulish", "Rubik", "Raleway", "IBM Plex Sans", "Libre Franklin", "Lora", "EB Garamond", "Source Serif 4",
];

// Which families are serifs — drives the fallback stack (Georgia vs system sans) everywhere fonts render.
export const SERIF_FONTS = new Set([
 "Playfair Display", "Bodoni Moda", "Cormorant Garamond", "Cormorant", "EB Garamond", "Newsreader",
 "Instrument Serif", "Fraunces", "Lora", "Spectral", "Crimson Pro", "Source Serif 4", "Bitter",
 "Literata", "Domine", "PT Serif", "Cardo",
]);

// Every font the studio may show — loaded together so the live preview (and the font-picker labels)
// render in their real faces, not a fallback.
export const ALL_STOREFRONT_FONTS = Array.from(new Set([...HEADING_FONTS, ...BODY_FONTS]));

/** Build a Google Fonts CSS2 stylesheet URL for the given families (each at 400–700). */
export function storefrontFontsHref(families: string[]): string {
 const q = Array.from(new Set(families.filter(Boolean))).map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;600;700`).join("&");
 return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

// One-click colour palettes for the Design panel — a whole scheme (page / ink / accent) picked as one,
// so a store restyles by clicking a swatch instead of fiddling with three hex fields. Kept intentionally
// tasteful and vintage-leaning; the individual colour pickers are still there for fine-tuning after.
export type StorefrontPalette = { id: string; name: string; colors: { bg: string; text: string; accent: string } };
// Curated palettes — tight, harmonized kits (a warm neutral ground, a deep near-black text, and ONE
// accent that belongs to the same family). Muted and sophisticated over saturated; the luxury signal is
// how few colours you use and how precisely they combine.
export const STOREFRONT_PALETTES: StorefrontPalette[] = [
 { id: "bone-ink", name: "Bone & Ink", colors: { bg: "#F4F0E8", text: "#1C1814", accent: "#2A2521" } },
 { id: "oxblood", name: "Oxblood", colors: { bg: "#ECE4D6", text: "#201811", accent: "#6C2126" } },
 { id: "ivory-camel", name: "Ivory & Camel", colors: { bg: "#FAF6EE", text: "#211D16", accent: "#A88C62" } },
 { id: "sage", name: "Sage", colors: { bg: "#E7E8DE", text: "#232720", accent: "#66765A" } },
 { id: "espresso", name: "Espresso", colors: { bg: "#ECE5D8", text: "#241B14", accent: "#6E4A32" } },
 { id: "terracotta", name: "Terracotta", colors: { bg: "#F2E7DA", text: "#372620", accent: "#B15E37" } },
 { id: "dusty-blue", name: "Dusty Blue", colors: { bg: "#ECE9E0", text: "#1A2431", accent: "#6D8AA1" } },
 { id: "blush", name: "Blush", colors: { bg: "#F3EAE3", text: "#2A222A", accent: "#8C6A74" } },
 { id: "antique-gold", name: "Antique Gold", colors: { bg: "#E9E0CE", text: "#191410", accent: "#A9854B" } },
 { id: "greige", name: "Greige", colors: { bg: "#EBE7DE", text: "#262218", accent: "#877A65" } },
 { id: "plum", name: "Plum", colors: { bg: "#F1ECEC", text: "#241C22", accent: "#6B3B52" } },
 { id: "charcoal", name: "Charcoal", colors: { bg: "#191A1E", text: "#ECE6DB", accent: "#C6A24A" } },
];

// The three corner styles ("shapes") the Design panel offers — mirrors Blocks' Radius type.
export const RADIUS_OPTIONS: { id: "sharp" | "soft" | "round"; name: string }[] = [
 { id: "sharp", name: "Sharp" },
 { id: "soft", name: "Soft" },
 { id: "round", name: "Round" },
];
