// Section LAYOUT variants — the "bones" of a section, independent of its "skin".
//
// Two dimensions, deliberately kept apart:
//  • `block.variant` (here) decides STRUCTURE — where the image sits, how many columns, whether
//    content overlaps the photo, whether it's a grid or a carousel.
//  • `block.style` (BlockStyle) decides APPEARANCE — type, colour, spacing, radius, buttons.
// Keeping them independent is what stops this becoming 75 frozen one-off templates: any layout can
// wear any skin, and a merchant who switches layouts keeps every style choice they made.
//
// A variant is DATA, not a parallel architecture. One entry powers the renderer, the picker, the
// thumbnail, the defaults, the sanitizer, and the content-preserving switcher.
//
// THE FIRST variant of each type is its legacy default: a block saved before variants existed has no
// `variant` field, and must keep rendering exactly what it rendered before. So the first entry always
// describes the layout that shipped, and `resolveVariant` falls back to it for absent/unknown ids.

import type { BlockType, BlockField } from "./storefront-blocks.ts";
import type { ItemSchemaName } from "./storefront-items.ts";

// Picker groupings — so ~75 layouts read as an organized library instead of a wall of cards.
export type SectionCategory = "Hero" | "Products" | "Collections" | "Editorial" | "Social Proof" | "Content" | "Media" | "Marketing" | "Miscellaneous";
// Display order in the picker. "Miscellaneous" last — it is the catch-all, so it should read as the
// place you look when nothing else fits, not as a category with a theme of its own.
export const SECTION_CATEGORIES: SectionCategory[] = ["Hero", "Products", "Collections", "Editorial", "Social Proof", "Content", "Media", "Marketing", "Miscellaneous"];

// What editing affordances a variant exposes. The editor reads this instead of special-casing
// layouts, so a new variant gets the right controls by declaring them rather than by wiring them.
export type VariantSupport = {
 // Built-in fields that can be dragged/scaled freely on the canvas (FreeField + style.free).
 // Structured layouts (grids, tables) leave this off and offer real structural controls instead.
 free?: readonly string[];
 // Repeated content this variant holds, by ITEM_SCHEMAS name — drives add/delete/reorder/duplicate.
 items?: ItemSchemaName;
 // Structural controls beyond the universal ones (height, padding, radius, border, shadow).
 // `split` = draggable divider, `cols` = column count, `gap` = spacing between items,
 // `cardWidth` = carousel card size, `ratio` = primary/secondary proportion.
 resize?: readonly ("split" | "cols" | "gap" | "cardWidth" | "ratio")[];
};

export type VariantDef = {
 id: string;
 label: string;
 description: string;
 // Extra editable fields this variant adds on top of the type's base fields (BLOCK_TYPES).
 fields?: BlockField[];
 // Props seeded when a merchant switches INTO this variant and the concept has no existing value.
 // Never overwrites content the merchant already has — see applyVariant in storefront-variant-switch.
 defaults?: Record<string, string>;
 supports?: VariantSupport;
};

export type VariantGroup = { type: BlockType; category: SectionCategory; variants: VariantDef[] };

// Fields shared by several hero layouts.
const HERO_BASE_FREE = ["heading", "subtext", "cta"] as const;

// Shared by every OPEN product layout. Capped at MAX_FEATURED so pointing a section at a 200-piece
// collection can never dump 200 products onto a homepage — the Shop page is where "everything" lives.
const HOW_MANY: BlockField = { key: "limit", label: "How many to show", kind: "choice", options: [{ value: "4", label: "4" }, { value: "8", label: "8" }, { value: "12", label: "12" }, { value: "16", label: "16" }, { value: "20", label: "20 (max)" }] };

export const VARIANTS: VariantGroup[] = [
 {
  type: "announcement", category: "Miscellaneous",
  variants: [
   { id: "bar", label: "Bar", description: "A thin colour bar across the very top.", supports: { free: [] } },
   { id: "quiet", label: "Hairline", description: "No fill — the message between two rules, on the page's own ground.", supports: { free: [] } },
   { id: "ticker", label: "Ticker", description: "The message repeating and scrolling across the strip.", supports: { free: [] } },
  ],
 },
 {
  type: "hero", category: "Hero",
  variants: [
   { id: "bleed", label: "Full bleed", description: "One photo edge to edge, headline and button over it.", supports: { free: HERO_BASE_FREE } },
   {
    id: "slides", label: "Slideshow", description: "Several full-bleed slides a shopper swipes through, each with its own photo and copy.",
    fields: [{ key: "slides", label: "Slides", kind: "textarea" }],
    supports: { free: HERO_BASE_FREE, items: "slides" },
   },
   {
    id: "split", label: "Split", description: "Photo on one side, headline and button on the other — calmer and more editorial than a bleed.",
    fields: [{ key: "imageSide", label: "Image side (left or right)", kind: "text" }],
    defaults: { imageSide: "left" },
    supports: { free: HERO_BASE_FREE, resize: ["split"] },
   },
   { id: "stack", label: "Stacked", description: "Centred headline above a wide photo — type leads, image supports.", supports: { free: HERO_BASE_FREE } },
   { id: "frame", label: "Framed", description: "An inset photo with generous margin, headline overlapping its edge.", supports: { free: HERO_BASE_FREE } },
  ],
 },
 {
  type: "featured", category: "Products",
  variants: [
   // How many pieces a section shows belongs to the LAYOUT, not to the section type. An open layout
   // (grid, carousel, archive list) can hold any number, so it offers the choice. A composed layout
   // (editorial's lead-plus-stack, mosaic's alternating anchors) is built around a fixed arrangement
   // — offering a count there would be a control that can't honestly change anything.
   { id: "grid", label: "Grid", description: "An even grid of your products.", supports: { free: ["heading"], resize: ["cols", "gap"] },
    fields: [
     HOW_MANY,
     // Only the grid has rows to divide, so only the grid offers a per-row control.
     { key: "cols", label: "Per row", kind: "choice", options: [{ value: "", label: "Auto — fit the number of pieces" }, { value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }, { value: "5", label: "5" }] },
    ] },
   { id: "carousel", label: "Carousel", description: "A swipeable rail that bleeds off the edge — fits more pieces without lengthening the page.", supports: { free: ["heading"], resize: ["cardWidth", "gap"] }, fields: [HOW_MANY] },
   { id: "editorial", label: "Editorial", description: "One piece leads at full height, the rest stacked beside it. Reads as a point of view.", supports: { free: ["heading"] } },
   { id: "mosaic", label: "Mosaic", description: "A deliberately uneven grid — large pieces anchoring alternating corners.", supports: { free: ["heading"], resize: ["gap"] } },
   { id: "list", label: "Archive list", description: "One piece per row: small photo, title, price. Dense and scannable.", supports: { free: ["heading"] }, fields: [HOW_MANY] },
  ],
 },
 {
  type: "collections", category: "Collections",
  variants: [
   { id: "grid", label: "Tile grid", description: "Category tiles in an even grid.", supports: { free: ["heading"], items: "collections", resize: ["cols", "gap"] } },
   { id: "row", label: "Rail", description: "A swipeable row of narrow tiles — fits many categories in one band.", supports: { free: ["heading"], items: "collections", resize: ["cardWidth"] } },
   { id: "duo", label: "Two up", description: "Two categories at full width and full height, for a store with one real split.", supports: { free: ["heading"], items: "collections" } },
   { id: "circles", label: "Circles", description: "Round tiles in a row — compact category navigation near the top of a page.", supports: { free: ["heading"], items: "collections" } },
   { id: "list", label: "Index", description: "Category names as large type, hairline-separated, photo on hover. Works with no photos at all.", supports: { free: ["heading"], items: "collections" } },
  ],
 },
 {
  type: "testimonials", category: "Social Proof",
  variants: [
   { id: "cards", label: "Three across", description: "Quotes side by side with stars and names.", supports: { free: ["heading"], items: "testimonials" } },
   { id: "single", label: "One large", description: "A single review at display size — more weight than three set small.", supports: { free: ["heading"], items: "testimonials" } },
   { id: "plain", label: "Plain", description: "No stars, no cards: quotes as running text down a narrow measure.", supports: { free: ["heading"], items: "testimonials" } },
   { id: "marquee", label: "Scrolling", description: "Quotes scrolling continuously across a strip — ambient reassurance.", supports: { free: ["heading"], items: "testimonials" } },
  ],
 },
 {
  type: "countdown", category: "Marketing",
  variants: [
   { id: "centered", label: "Centred", description: "A live countdown under a headline.", supports: { free: ["heading", "subtext", "cta"] } },
   { id: "strip", label: "Strip", description: "A compact band — copy one side, clock the other. Sits between sections without taking over.", supports: { free: ["heading", "subtext", "cta"] } },
   { id: "display", label: "Display", description: "The clock at full size leading the section, copy beneath. Maximum urgency.", supports: { free: ["heading", "subtext", "cta"] } },
  ],
 },
 {
  type: "blog", category: "Editorial",
  variants: [
   { id: "row", label: "Three across", description: "A row of articles with photos and excerpts.", supports: { free: ["heading"], items: "blog" } },
   { id: "feature", label: "Lead story", description: "One story at full width with the rest listed beside it — the front page.", supports: { free: ["heading"], items: "blog" } },
   { id: "list", label: "Archive", description: "One post per row with a thumbnail. Scales past three without becoming a grid of cards.", supports: { free: ["heading"], items: "blog" } },
  ],
 },
 {
  type: "split", category: "Editorial",
  variants: [
   { id: "half", label: "Half and half", description: "A photo beside a heading, paragraph, and button.", supports: { free: ["heading", "cta"], resize: ["split"] } },
   { id: "offset", label: "Offset", description: "A taller photo with the copy set low against it, so the two blocks don't line up.", supports: { free: ["heading", "cta"] } },
   { id: "panel", label: "Panel", description: "Edge to edge: photo fills one half, copy sits on a solid panel filling the other.", supports: { free: ["heading", "cta"] } },
   { id: "stacked", label: "Stacked", description: "Photo above, copy centred beneath — identical on a phone and a desktop.", supports: { free: ["heading", "cta"] } },
  ],
 },
 {
  type: "columns", category: "Content",
  variants: [
   { id: "image", label: "With photos", description: "Content side by side, each with an optional image, heading, text, and button.", supports: { free: ["heading"], items: "columns", resize: ["cols", "gap"] } },
   { id: "claims", label: "Promises", description: "No photos — short promises in display type over one line each. The service band.", supports: { free: ["heading"], items: "columns", resize: ["cols"] } },
   { id: "steps", label: "Numbered steps", description: "In sequence, numbered by position, with a hairline between. Reordering renumbers.", supports: { free: ["heading"], items: "columns", resize: ["cols"] } },
   { id: "bordered", label: "Framed", description: "Each column a bordered panel, flush against its neighbours.", supports: { free: ["heading"], items: "columns", resize: ["cols"] } },
  ],
 },
 {
  type: "text", category: "Content",
  variants: [
   { id: "centered", label: "Centred", description: "A heading and a paragraph, centred in a narrow measure.", supports: { free: ["heading"] } },
   { id: "editorial", label: "Editorial", description: "Heading held in a narrow column beside the copy — a magazine standfirst.", supports: { free: ["heading"] } },
   { id: "columns", label: "Two columns", description: "The copy set newspaper-style. Gets better the more words you have.", supports: { free: ["heading"] } },
   { id: "lede", label: "Lede", description: "Heading at display size, the paragraph beneath it as a caption.", supports: { free: ["heading"] } },
  ],
 },
 {
  type: "image", category: "Media",
  variants: [
   { id: "full", label: "Full width", description: "A single full-width photo with an optional caption.", supports: { free: [] } },
   { id: "inset", label: "Inset", description: "Held inside the page's measure with real margin — a plate in a book.", supports: { free: [] } },
   { id: "captioned", label: "Captioned", description: "A portrait photo with its caption set beside it in the margin.", supports: { free: [] } },
  ],
 },
 {
  type: "gallery", category: "Media",
  variants: [
   { id: "grid", label: "Grid", description: "A tight grid of photos — the contact sheet.", supports: { items: "gallery", resize: ["cols", "gap"] } },
   { id: "loose", label: "Airy", description: "Fewer per row, real gutters, page margins. Room to actually look at them.", supports: { items: "gallery", resize: ["gap"] } },
   { id: "mosaic", label: "Mosaic", description: "An uneven rhythm — every third photo runs tall.", supports: { items: "gallery", resize: ["gap"] } },
   { id: "rail", label: "Rail", description: "A swipeable strip that bleeds off the edge — a whole lookbook in one band.", supports: { items: "gallery" } },
  ],
 },
 {
  type: "marquee", category: "Miscellaneous",
  variants: [
   { id: "scroll", label: "Scrolling strip", description: "Words that scroll continuously across the page.", supports: { items: "marquee" } },
   { id: "static", label: "Static row", description: "The names centred in a row, no motion — easier to actually read.", supports: { items: "marquee" } },
   { id: "display", label: "Display", description: "Oversized type, scrolling faintly. The names become the graphic.", supports: { items: "marquee" } },
  ],
 },
 {
  type: "statement", category: "Editorial",
  variants: [
   { id: "large", label: "Large quote", description: "One oversized statement, best on a dark or accent ground.", supports: { free: ["attribution"] } },
   { id: "boxed", label: "Pull quote", description: "Centred between two rules — lifted out of the page rather than leading it.", supports: { free: ["attribution"] } },
   { id: "side", label: "Credited", description: "The attribution beside the quote on its own hairline column, like a byline.", supports: { free: ["attribution"] } },
  ],
 },
 {
  type: "spotlight", category: "Products",
  variants: [
   { id: "half", label: "Half and half", description: "One hero piece, big, beside its details and a button.", supports: { free: ["heading", "price", "cta"], resize: ["split"] } },
   { id: "overlay", label: "Overlay", description: "Details over the photo, bottom left — lookbook rather than catalogue.", supports: { free: ["heading", "price", "cta"] } },
   { id: "stacked", label: "Stacked", description: "Photo above, details centred beneath. Identical on a phone and a desktop.", supports: { free: ["heading", "price", "cta"] } },
  ],
 },
 {
  type: "video", category: "Media",
  variants: [
   { id: "framed", label: "Framed", description: "A 16:9 video in the page's measure, with an optional caption.", supports: { free: [] } },
   { id: "bleed", label: "Full bleed", description: "Edge to edge and cinematic — for a campaign film, not a clip.", supports: { free: [] } },
   { id: "portrait", label: "Portrait", description: "The shape a phone shoots. Suits a reel or a try-on that looks wrong letterboxed.", supports: { free: [] } },
  ],
 },
 {
  type: "newsletter", category: "Marketing",
  variants: [
   { id: "centered", label: "Centred", description: "A signup form under a headline.", supports: { free: ["heading", "subtext", "cta"] } },
   { id: "split", label: "Split", description: "Copy on one side, the form on the other — room to make the case.", supports: { free: ["heading", "subtext", "cta"] } },
   { id: "bar", label: "Band", description: "A tight strip: one line of copy and the field side by side.", supports: { free: ["heading", "cta"] } },
   { id: "photo", label: "Over a photo", description: "The invitation over the section's background image, centred and full height.", supports: { free: ["heading", "subtext", "cta"] } },
  ],
 },
 {
  type: "contact", category: "Miscellaneous",
  variants: [
   { id: "form", label: "Form", description: "A name / email / message form with an optional contact address.", supports: { free: ["heading", "subtext", "cta"] } },
   { id: "split", label: "Split", description: "Copy and contact details one side, the form the other.", supports: { free: ["heading", "subtext", "cta"] } },
   { id: "card", label: "Card", description: "The form in a bordered card on a tinted ground — self-contained.", supports: { free: ["heading", "subtext", "cta"] } },
  ],
 },
 {
  type: "faq", category: "Miscellaneous",
  variants: [
   { id: "accordion", label: "Accordion", description: "Expandable question-and-answer rows — click to open, one column.", supports: { free: ["heading"] } },
   { id: "two-column", label: "Two column", description: "The same accordion split down the middle. For a list long enough to read as a wall.", supports: { free: ["heading"] } },
   { id: "sided", label: "Sided", description: "Heading and intro pinned left, questions stacked right — the editorial two-up.", supports: { free: ["heading"] } },
   { id: "cards", label: "Cards", description: "Each question in its own bordered panel, answers always visible. Best when they're short.", supports: { free: ["heading"], resize: ["cols"] } },
   { id: "numbered", label: "Numbered", description: "Display numerals beside each question, numbered by position.", supports: { free: ["heading"] } },
   { id: "index", label: "Index", description: "A contents column of questions beside the answers, all open. The documentation pattern.", supports: { free: ["heading"] } },
  ],
 },
 {
  type: "custom", category: "Miscellaneous",
  variants: [
   { id: "html", label: "Custom", description: "Your own HTML, CSS, and (sandboxed) JavaScript.", supports: {} },
  ],
 },
];

const BY_TYPE = new Map<string, VariantGroup>(VARIANTS.map((g) => [g.type, g]));

export function variantGroup(type: string): VariantGroup | undefined {
 return BY_TYPE.get(type);
}
export function variantsFor(type: string): VariantDef[] {
 return BY_TYPE.get(type)?.variants ?? [];
}
export function categoryFor(type: string): SectionCategory {
 return BY_TYPE.get(type)?.category ?? "Miscellaneous";
}
// The id a block with no explicit variant renders as — the layout that shipped before variants existed.
export function defaultVariantId(type: string): string {
 return BY_TYPE.get(type)?.variants[0]?.id ?? "";
}
export function isKnownVariant(type: string, id: unknown): boolean {
 return typeof id === "string" && variantsFor(type).some((v) => v.id === id);
}
// Resolve what to actually render: an unknown or absent id falls back to the type's default rather
// than rendering nothing — a storefront must never go blank because of a bad or future variant id.
export function resolveVariant(type: string, id?: string): VariantDef | undefined {
 const vs = variantsFor(type);
 return vs.find((v) => v.id === id) ?? vs[0];
}
export function variantSupports(type: string, id?: string): VariantSupport {
 return resolveVariant(type, id)?.supports ?? {};
}
// The id worth STORING for a chosen layout: the type's default is left unset, so a block built from
// the default layout is byte-identical to one saved before variants existed.
export function normalizeVariant(type: string, id?: string): string | undefined {
 return !id || id === defaultVariantId(type) ? undefined : id;
}
// Props a newly added section of this layout starts with. Composed with makeBlock by the caller —
// this module stays free of runtime imports so both halves can be unit-tested in isolation.
export function variantDefaults(type: string, id?: string): Record<string, string> {
 return { ...(resolveVariant(type, id)?.defaults || {}) };
}
