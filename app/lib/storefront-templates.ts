// Storefront starter templates — each is a COMPLETE vibe: a palette, a font pairing, AND a
// tasteful starter layout built from the section types. Picking one restyles the store and lays
// out a real home page the seller can then edit or ask VYA to change. Grounded in real VYA stores.

import { makeBlock, type Block, type BlockType, type BlockStyle } from "./storefront-blocks";

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
 description: "Cream and black with a high-contrast fashion-magazine serif. The premium boutique look.",
 colors: { bg: "#FFFDF8", text: "#1a1a1a", accent: "#1a1a1a" },
 fonts: { heading: "Playfair Display", body: "Inter" },
 heroStyle: "carousel",
 layout: [
 { type: "announcement", props: { text: "Complimentary shipping on orders over $150" } },
 { type: "hero", props: { heading: "The New Arrivals", subtext: "Curated vintage, one piece at a time.", cta: "Shop the edit" } },
 { type: "featured", props: { heading: "The Edit" } },
 { type: "split", props: { heading: "Sourced, not stocked", body: "Every piece is found, authenticated, and photographed by hand — never mass-listed.", cta: "Our story", imageSide: "left" } },
 { type: "statement", props: { quote: "The right piece finds the right person." }, style: { bg: "dark" } },
 { type: "newsletter", props: { heading: "Join the list", subtext: "First look at every new arrival." } },
 ],
 },
 {
 id: "archive-noir",
 name: "Archive Noir",
 description: "Bone and oxblood with a bold grotesque display and dark editorial sections. Moody and archival.",
 colors: { bg: "#e9e3d8", text: "#17120e", accent: "#5a0e17" },
 fonts: { heading: "Archivo", body: "Inter" },
 heroStyle: "text-over-image",
 layout: [
 { type: "hero", props: { heading: "Only ever made once.", subtext: "Archival & designer vintage — sourced, authenticated, never restocked.", cta: "Enter the archive" }, style: { bg: "dark" } },
 { type: "marquee", props: { items: "Cavalli\nMugler\nBlumarine\nTom Ford\nGaultier\nVersace" } },
 { type: "featured", props: { heading: "New to the archive" } },
 { type: "split", props: { heading: "Authenticated by hand", body: "Every piece is examined against archive references and dated to its season. When it sells, it’s gone.", cta: "How we authenticate", imageSide: "left" } },
 { type: "statement", props: { quote: "When a piece is gone, it belongs to whoever moved first." }, style: { bg: "dark" } },
 { type: "newsletter", props: { heading: "First look at every drop", subtext: "Members see it before it’s public." } },
 ],
 },
 {
 id: "modern-minimal",
 name: "Modern Minimal",
 description: "Clean white with a crisp geometric sans. Lets the product photography do the talking.",
 colors: { bg: "#ffffff", text: "#1c1c1c", accent: "#1c1c1c" },
 fonts: { heading: "Outfit", body: "Inter" },
 heroStyle: "minimal",
 layout: [
 { type: "hero", props: { heading: "Less, but better.", subtext: "A tight edit of considered vintage.", cta: "Shop" } },
 { type: "featured", props: { heading: "In stock" } },
 { type: "split", props: { heading: "Made to last", body: "Pieces chosen for how they wear, not how they trend.", cta: "About", imageSide: "right" } },
 { type: "newsletter", props: { heading: "Stay in the loop", subtext: "New drops, no noise." } },
 ],
 },
 {
 id: "literary-archive",
 name: "Literary Archive",
 description: "Soft white and an all-serif, book-like feel. Atmospheric and story-forward.",
 colors: { bg: "#faf9f6", text: "#161616", accent: "#161616" },
 fonts: { heading: "Newsreader", body: "Newsreader" },
 heroStyle: "text-over-image",
 layout: [
 { type: "hero", props: { heading: "An archive of the worn and wonderful", subtext: "Stories you can wear.", cta: "Enter" } },
 { type: "text", props: { heading: "On collecting", body: "A few lines about what you look for, and why it matters. Set the tone before the pieces speak for themselves." } },
 { type: "featured", props: { heading: "Recent finds" } },
 { type: "statement", props: { quote: "Every garment carries a life before yours." }, style: { bg: "accent" } },
 { type: "newsletter", props: { heading: "The dispatch", subtext: "Notes and new arrivals, occasionally." } },
 ],
 },
 {
 id: "romantic",
 name: "Romantic",
 description: "Warm cream with a berry accent and an elegant serif headline. Soft and feminine.",
 colors: { bg: "#f5f2ee", text: "#2a1a22", accent: "#8d2c5b" },
 fonts: { heading: "Playfair Display", body: "Poppins" },
 heroStyle: "text-over-image",
 layout: [
 { type: "announcement", props: { text: "New pieces added every Friday" } },
 { type: "hero", props: { heading: "Softly, beautifully worn", subtext: "Romantic vintage for every day.", cta: "Shop now" } },
 { type: "split", props: { heading: "Chosen with love", body: "Each piece is picked for its charm and cared for before it reaches you.", cta: "Our story", imageSide: "left" } },
 { type: "featured", props: { heading: "Just in" } },
 { type: "newsletter", props: { heading: "Join us", subtext: "First dibs on new treasures." } },
 ],
 },
 {
 id: "warm-earthy",
 name: "Warm Earthy",
 description: "Saturated terracotta and gold with an approachable sans. Eclectic and sun-faded.",
 colors: { bg: "#c97855", text: "#f6f1e9", accent: "#f6e4c4" },
 fonts: { heading: "Montserrat", body: "Montserrat" },
 heroStyle: "logo-masthead",
 layout: [
 { type: "hero", props: { heading: "Sun-faded & one of a kind", subtext: "Eclectic vintage, warmly worn.", cta: "Shop the collection" } },
 { type: "marquee", props: { items: "Denim\nLeather\nWorkwear\nBoho\nWestern\nSilk" } },
 { type: "featured", props: { heading: "The collection" } },
 { type: "statement", props: { quote: "Everything here has a story to tell." }, style: { bg: "dark" } },
 { type: "newsletter", props: { heading: "Come along", subtext: "New finds, straight to your inbox." } },
 ],
 },
 {
 id: "playful-drop",
 name: "Playful Drop",
 description: "Clean white with one punchy accent and a drop banner. Young and loud.",
 colors: { bg: "#ffffff", text: "#111111", accent: "#ff1086" },
 fonts: { heading: "Space Grotesk", body: "Inter" },
 heroStyle: "drop-banner",
 layout: [
 { type: "announcement", props: { text: "★ NEW DROP FRIDAY 6PM — DON’T SLEEP ★" } },
 { type: "hero", props: { heading: "Fresh drops, zero repeats", subtext: "One-of-one, gone when they’re gone.", cta: "Shop the drop" } },
 { type: "featured", props: { heading: "This week" } },
 { type: "marquee", props: { items: "Y2K\nStreetwear\nGraphic tees\nArchive\nRare\nGrails" } },
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

// Curated fonts a store can swap to (Google Fonts — the storefront loads them by name).
export const HEADING_FONTS = ["Playfair Display", "Bodoni Moda", "Cormorant Garamond", "Newsreader", "Instrument Serif", "Fraunces", "Outfit", "Space Grotesk", "Archivo", "Montserrat", "Jost"];
export const BODY_FONTS = ["Inter", "Newsreader", "Poppins", "Montserrat", "Figtree", "Outfit", "Work Sans", "Nunito Sans", "Roboto"];
