// Storefront starter templates — each is a COMPLETE store, not a colour scheme.
//
// A template carries four things, and all four are what make it itself:
//   • a palette + type pairing + corner style
//   • a HOME page: which sections, in what order, in WHICH LAYOUT (block.variant)
//   • a SHOP page: the intro above the catalogue, and the density of the catalogue grid
//   • the store's other PAGES (About, Authentication, Visit, FAQ…), each built from the same blocks
//
// The layout is the part that matters most. Two templates with the same sections in the same order
// are the same template wearing different paint — so every entry below picks a variant per section
// (see storefront-variants.ts), and no two open the same way.
//
// Distilled from a close read of fifteen real vintage stores (Aug 2026). Copy follows what those
// stores actually write: short, operational, no slogans. Every fact only the seller can know is
// bracketed — [YOUR CITY], [DROP DAY] — so nothing invented ever ships live.

import { makeBlock, type Block, type BlockType, type BlockStyle } from "./storefront-blocks.ts";
import { greekBlocks } from "./storefront-greek.ts";

export type HeroStyle = "carousel" | "text-over-image" | "logo-masthead" | "drop-banner" | "minimal";

/** One section in a template: its type, its LAYOUT (variant), its starting copy, its background. */
export type Spec = { type: BlockType; variant?: string; props?: Record<string, string>; style?: BlockStyle };

/** A page beyond the home page — same block system, its own slug. */
export type TemplatePage = { slug: string; title: string; blocks: Spec[] };

/**
 * The catalogue grid on the Shop page. This is the one template property the section system can't
 * already express: a `featured` block carries its own cols/gap, but the Shop page's grid is the
 * store's whole catalogue and belongs to the template. Vitrine at 2-up and The Index at 5-up are
 * the same page doing genuinely different jobs.
 */
export type TemplateGrid = {
 cols: 2 | 3 | 4 | 5;
 ratio: "4/5" | "1/1" | "5/6" | "3/4"; // card shape — portrait, square, or the two in between
 gutter: "tight" | "normal" | "wide";
};

/**
 * How a single product is presented. Three arrangements, because these are the three that actually
 * differ in how a shopper reads the page:
 *   classic — gallery left, details right. The conventional two-column product page.
 *   rail    — images stacked down a wide column, details in a narrow rail that stays with you while
 *             you scroll. For stores where the detail (era, measurements, authentication) is the sale.
 *   stacked — full-width images one after another, details centred beneath in a narrow measure.
 *             For stores where the photography is the argument and copy is an afterthought.
 */
export type ProductLayout = "classic" | "rail" | "stacked";

export type StorefrontTemplate = {
 id: string;
 name: string;
 description: string;
 /** Who this is for — shown in the picker, so a seller chooses on fit rather than on looks. */
 bestFor: string;
 /** The one structural decision that makes this template itself. Shown when previewing. */
 signature: string;
 colors: { bg: string; text: string; accent: string };
 fonts: { heading: string; body: string };
 radius: "sharp" | "soft" | "round";
 headerLayout: "inline" | "center" | "split" | "stacked";
 heroStyle: HeroStyle; // legacy label kept for the picker's summary line
 grid: TemplateGrid;
 productLayout: ProductLayout;
 layout: Spec[]; // home page
 shop: Spec[]; // sections above the catalogue on the Shop page
 pages: TemplatePage[]; // About, Contact, FAQ, …
};

// Copy shared across templates where the SAME operational fact is being stated. Kept as constants so
// the shipping terms in an announcement and on a Shipping page can't drift apart.
const SHIP_LINE = "Complimentary shipping on orders over $[AMOUNT]";
const RETURNS_BODY =
 "Pieces ship within [1–2] business days from [YOUR CITY]. Tracking arrives by email as soon as your order is on its way.\n\nEvery piece is one of one and sold as described, so all sales are final unless the item arrives damaged or is materially different from its listing. If that happens, email us within [7] days and we'll make it right.";

// Category tiles that always resolve to something. A tile naming a designer the store doesn't carry
// is the single worst failure in a starter template — it sends a shopper to an empty aisle on their
// first click. Garment categories map to the platform's own buckets (normalizeCategory), so these
// work on day one and onboarding replaces them with the seller's real collections.
const SAFE_TILES = "Dresses\nOuterwear\nDenim\nKnitwear\nBags\nShoes";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The four pages every storefront needs
//
// Shipping, authentication, an FAQ and a way to reach a human are not stylistic choices — a
// storefront missing any of them looks unfinished to a buyer and loses sales at the moment of
// deciding. They were scattered across the templates: one had shipping, two had authentication,
// one had no FAQ at all.
//
// So the STRUCTURE is shared and the WORDS are not. Every store gets the same four pages, built
// the same way, and each template says it in its own voice — a drop store and an archive dealer
// answer "is it real?" very differently, and flattening that would make eight templates read as
// one. Placeholders in [brackets] are the seller's to fill.
// ─────────────────────────────────────────────────────────────────────────────────────────────
type StandardCopy = {
 /** Authentication: how this store decides a piece is what it says it is. Three steps. */
 auth: { lede: string; steps: string; closing?: string };
 /** Shipping & returns: dispatch, cost, tracking, returns. */
 shipping: { lede: string; faq: Array<[string, string]> };
 /** The general FAQ — sizing, condition, payment, everything else. */
 faq: { lede: string; items: Array<[string, string]> };
 /** About + how to reach you, on one page: a buyer looking for either wants the other too. */
 about: { heading: string; body: string; contactHeading: string; contactNote: string };
};

const faqProps = (heading: string, subtext: string, items: Array<[string, string]>): Record<string, string> => {
 const out: Record<string, string> = { heading, subtext };
 items.slice(0, 8).forEach(([q, a], i) => { out[`q${i}`] = q; out[`a${i}`] = a; });
 return out;
};

/** The same facts, told several different ways — see PAGE_STYLE. */
type AuthStyle = "steps" | "claims" | "bordered" | "cards" | "prose" | "split";
type ListStyle = "index" | "sided" | "numbered" | "cards" | "two-column" | "bordered";
type AboutStyle = "editorial" | "panel" | "statement";

/** "Label | Body | | | \n..." -> [label, body] pairs, so one piece of copy can be a step list, a
 *  set of cards, an FAQ or a run of prose depending on which template is asking. */
const pairs = (items: string): Array<[string, string]> =>
 items.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((c) => c[0]).map((c) => [c[0], c[1] || ""] as [string, string]);

function authBlocks(c: StandardCopy, style: AuthStyle): Spec[] {
 const lede: Spec = { type: "text", variant: "lede", props: { heading: "How we know it's real", body: c.auth.lede } };
 const close: Spec[] = c.auth.closing ? [{ type: "text", variant: "centered", props: { heading: "When we can't be sure", body: c.auth.closing } }] : [];
 switch (style) {
  case "claims": return [lede, { type: "columns", variant: "claims", props: { heading: "", items: c.auth.steps, cols: "3" } }, ...close];
  case "bordered": return [lede, { type: "columns", variant: "bordered", props: { heading: "", items: c.auth.steps, cols: "3" } }, ...close];
  case "cards": return [lede, { type: "faq", variant: "cards", props: faqProps("", "", pairs(c.auth.steps)) }, ...close];
  case "split": return [
   lede,
   ...pairs(c.auth.steps).map((pr, i): Spec => ({ type: "split", variant: "half", props: { heading: pr[0], body: pr[1], cta: "", image: "", imageSide: i % 2 ? "right" : "left" } })),
   ...close,
  ];
  case "prose": return [{ type: "text", variant: "editorial", props: { heading: "How we know it's real", body: [c.auth.lede, ...pairs(c.auth.steps).map((pr) => `${pr[0]}. ${pr[1]}`), c.auth.closing || ""].filter(Boolean).join("\n\n") } }];
  default: return [lede, { type: "columns", variant: "steps", props: { heading: "", items: c.auth.steps, cols: "3" } }, ...close];
 }
}

function listBlocks(heading: string, lede: string, items: Array<[string, string]>, style: ListStyle): Spec[] {
 const head: Spec[] = lede ? [{ type: "text", variant: "lede", props: { heading, body: lede } }] : [];
 if (style === "bordered") return [...head, { type: "columns", variant: "bordered", props: { heading: "", items: items.map((it) => `${it[0]} | ${it[1]} | | | `).join("\n"), cols: "2" } }];
 return [...head, { type: "faq", variant: style, props: faqProps(lede ? "" : heading, "", items) }];
}

function aboutBlocks(c: StandardCopy, style: AboutStyle): Spec[] {
 const contact: Spec = { type: "contact", variant: style === "panel" ? "card" : "split", props: { heading: c.about.contactHeading, subtext: c.about.contactNote, email: "[YOUR EMAIL]", cta: "Send" } };
 switch (style) {
  case "panel": return [{ type: "split", variant: "panel", props: { heading: c.about.heading, body: c.about.body, cta: "", image: "", imageSide: "left" } }, contact];
  case "statement": return [
   { type: "statement", variant: "large", props: { quote: c.about.heading, attribution: "" }, style: { bg: "accent" } },
   { type: "text", variant: "columns", props: { heading: "", body: c.about.body } },
   contact,
  ];
  default: return [{ type: "text", variant: "editorial", props: { heading: c.about.heading, body: c.about.body } }, contact];
 }
}

// Which presentation each template uses. The four pages carry the same four facts everywhere; the
// LOOK of them does not. Eight stores explaining authentication with an identical numbered timeline
// is exactly what makes a template library feel like one template wearing eight palettes.
const PAGE_STYLE: Record<string, { auth: AuthStyle; shipping: ListStyle; faq: ListStyle; about: AboutStyle }> = {
 heirloom: { auth: "steps", shipping: "numbered", faq: "two-column", about: "editorial" },
 provenance: { auth: "steps", shipping: "bordered", faq: "index", about: "editorial" },
 "the-index": { auth: "bordered", shipping: "index", faq: "two-column", about: "panel" },
 drop: { auth: "claims", shipping: "numbered", faq: "cards", about: "statement" },
 "dear-reader": { auth: "prose", shipping: "sided", faq: "sided", about: "editorial" },
 sugar: { auth: "cards", shipping: "cards", faq: "cards", about: "statement" },
 vitrine: { auth: "steps", shipping: "index", faq: "index", about: "editorial" },
 "corner-shop": { auth: "split", shipping: "sided", faq: "numbered", about: "panel" },
};

function standardPages(id: string, c: StandardCopy, skip: string[] = []): TemplatePage[] {
 // A template that already answers one of these in its own words keeps its own page — Heirloom's
 // "Authenticity" and Dear Reader's "Shipping & Returns" are better than anything generic. `skip`
 // names those, so this fills gaps rather than overwriting character.
 const want = (slug: string) => !skip.includes(slug);
 const st = PAGE_STYLE[id] ?? PAGE_STYLE.heirloom;
 return [
  ...(want("authentication") ? ([{ slug: "authentication", title: "Authentication", blocks: authBlocks(c, st.auth) }] as TemplatePage[]) : []),
  ...(want("shipping") ? ([{ slug: "shipping", title: "Shipping & Returns", blocks: listBlocks("Shipping & returns", c.shipping.lede, c.shipping.faq, st.shipping) }] as TemplatePage[]) : []),
  ...(want("faq") ? ([{ slug: "faq", title: "FAQ", blocks: listBlocks("Questions", c.faq.lede, c.faq.items, st.faq) }] as TemplatePage[]) : []),
  ...(want("about") ? ([{ slug: "about", title: "About", blocks: aboutBlocks(c, st.about) }] as TemplatePage[]) : []),
 ];
}

// Per-template words for the four standard pages. Structure is shared (see standardPages); the
// voice is not — a drop store and an archive dealer answer "is it real?" very differently, and a
// seller who edits nothing should still sound like the store they picked.
const STANDARD_COPY: Record<string, StandardCopy> = {
 heirloom: {
  auth: { lede: "", steps: "" },
  shipping: {
   lede: "Pieces are wrapped by hand and sent tracked. Nothing here is replaceable, so nothing here is sent casually.",
   faq: [
    ["When does it ship?", "Within [2 business days]. You'll get a tracking number the moment it leaves."],
    ["What does it cost?", "[Flat rate] within [country]; complimentary over $[AMOUNT]. International is quoted at checkout."],
    ["Do you take returns?", "[14 days] from delivery, unworn, with tags where they exist. Tell us first so we can expect it."],
    ["What if it arrives damaged?", "Photograph it before unwrapping any further and email us the same day. It is insured."],
   ],
  },
  faq: {
   lede: "The questions we're asked most, answered as plainly as we can.",
   items: [
    ["How do I know it will fit?", "Every piece is measured flat, in inches, and listed as taken. Measure something you already own and compare — vintage sizing has almost no relationship to modern sizing."],
    ["Is the condition really as described?", "Yes, and wear is photographed rather than written around. If a fault isn't in the photos, it isn't there."],
    ["Can you hold a piece?", "For [48 hours], once. Email and ask."],
    ["Do you restock?", "No. Every piece is one piece."],
    ["Can I see more photos?", "Always. Ask and we'll take them the same day."],
    ["How do I care for it?", "Care notes are on each listing. When in doubt, a specialist cleaner who knows vintage is worth the money."],
   ],
  },
  about: { heading: "", body: "", contactHeading: "", contactNote: "" },
 },
 provenance: {
  auth: { lede: "", steps: "" },
  shipping: {
   lede: "Every piece leaves with its documentation. Shipping is tracked and insured to the full value, without exception.",
   faq: [
    ["Dispatch", "Within [2 business days] of payment clearing. Authentication paperwork travels with the piece."],
    ["Insurance", "Every parcel is insured for the full purchase price. There is no option to decline it."],
    ["International", "We ship worldwide. Duties are the buyer's responsibility and are not included at checkout."],
    ["Returns", "[14 days] if the piece is not as described. Authentication disputes are handled separately — see Authentication."],
   ],
  },
  faq: { lede: "", items: [] },
  about: {
   heading: "About this archive",
   body: "[Who you are, how long you have been dealing, and what you specialise in. Buyers spending four figures on an unrepeatable object want to know who they are buying from — this is where you tell them. Two or three paragraphs.]",
   contactHeading: "Speak to us",
   contactNote: "Condition reports, additional photographs, or a question about provenance — we answer within [1 business day].",
  },
 },
 "the-index": {
  auth: {
   lede: "Every entry in the index is checked before it is catalogued. Here is the procedure, in order.",
   steps: "Construction | Seams, linings, hardware and finishing are compared against period-correct references for the label and the decade. | | | \nLabels & marks | Brand, care, union and RN marks are dated against known production windows. A label that postdates the garment is disqualifying. | | | \nMaterials | Fibre content is checked against the label and against the hand of the cloth. Where they disagree, the cloth wins. | | | ",
   closing: "An entry we cannot date confidently is listed as unattributed and priced as unattributed. We would rather under-claim than guess.",
  },
  shipping: {
   lede: "Dispatch, cost and returns — stated once, applied to every entry.",
   faq: [
    ["Dispatch window", "[2 business days]. Tracking is issued automatically."],
    ["Rates", "[Flat rate] domestic, complimentary over $[AMOUNT]. International calculated at checkout."],
    ["Returns", "[14 days] from delivery, unworn. The entry number must be included."],
    ["Damage in transit", "Photograph before further unwrapping and email within [48 hours]."],
   ],
  },
  faq: { lede: "", items: [] },
  about: {
   heading: "About the index",
   body: "[What this catalogue is, what gets into it, and what does not. The index format promises rigour — this page is where you say what that rigour actually consists of. Two or three paragraphs.]",
   contactHeading: "Enquiries",
   contactNote: "Reference the entry number and we'll answer within [1 business day].",
  },
 },
 drop: {
  auth: {
   lede: "Everything in a drop is checked before it goes live. No exceptions, no \"probably\".",
   steps: "Checked in | Every piece is photographed, measured and inspected the day it lands. | | | \nVerified | Labels, stitching and hardware are matched against references for the year it claims. | | | \nCalled | If it passes, it drops. If it doesn't, it doesn't — we don't quietly list the maybes. | | | ",
   closing: "If something slips through, tell us and we'll refund you in full, no argument and no restocking fee.",
  },
  shipping: {
   lede: "Drops sell out fast, so shipping is built to move fast too.",
   faq: [
    ["How fast does it ship?", "Same or next business day. Tracking hits your inbox automatically."],
    ["Cost", "[Flat rate] domestic, free over $[AMOUNT]. International quoted at checkout."],
    ["Returns", "[14 days], unworn, tags on. Drops are final for sizing regret — measure first."],
    ["Missed the drop?", "Nothing restocks. Get on the list for the next one."],
   ],
  },
  faq: { lede: "", items: [] },
  about: {
   heading: "About",
   body: "[Who runs this, what you hunt for, and why the drop format. Two or three paragraphs, in your own voice — the drop format lives or dies on people trusting the person behind it.]",
   contactHeading: "Questions",
   contactNote: "Fit, condition, or where something came from — we answer fast.",
  },
 },
 "dear-reader": {
  auth: {
   lede: "Every piece is examined before it is written about. Here is what that examination involves.",
   steps: "The making | Seams, linings and hardware are read against how the house built things in that decade. | | | \nThe labels | Brand, care and union labels are dated to the years they were actually in use. | | | \nThe cloth | Fibre content is checked against the label, and against what the fabric does in the hand. | | | ",
   closing: "Where we cannot be certain, the listing says so in as many words. An honest \"we think\" is worth more than a confident wrong answer.",
  },
  shipping: { lede: "", faq: [] },
  faq: {
   lede: "Everything else you might want to know.",
   items: [
    ["How do I know it will fit?", "Every piece is measured flat and listed as taken. Compare against something in your own wardrobe — vintage sizing is its own country."],
    ["Is the condition honest?", "Wear is photographed, not described around. What you see is the whole of it."],
    ["Can you hold something?", "For [48 hours]. Just ask."],
    ["Will it come back in stock?", "No. Everything is a single piece."],
    ["Can I ask for more photographs?", "Yes, always, and we like being asked."],
    ["How should I care for it?", "Notes are on each listing. For anything fragile, a cleaner who knows vintage is worth every penny."],
   ],
  },
  about: { heading: "", body: "", contactHeading: "", contactNote: "" },
 },
 sugar: {
  auth: {
   lede: "Everything gets checked before it goes up. Here's how.",
   steps: "We look properly | Seams, linings, hardware — checked against how it should have been made. | | | \nWe date the labels | Brand and care labels get matched to the years they were actually used. | | | \nWe check the cloth | What the label says versus what the fabric actually is. | | | ",
   closing: "If we can't be sure, we say so right in the listing and price it like we're not sure. No guessing dressed up as fact.",
  },
  shipping: {
   lede: "Packed with care, sent quickly, tracked the whole way.",
   faq: [
    ["When does it ship?", "Within [2 business days], with tracking."],
    ["What does shipping cost?", "[Flat rate], and free over $[AMOUNT]."],
    ["Can I return it?", "[14 days], unworn. Message us first so we know it's coming."],
    ["Do you ship internationally?", "Yes — cost is calculated at checkout, duties are yours."],
   ],
  },
  faq: {
   lede: "Everything people ask us.",
   items: [
    ["Will it fit?", "Every piece is measured flat and the numbers are on the listing. Measure something you love and compare."],
    ["Is it in good condition?", "Whatever wear there is, it's photographed. Nothing hidden."],
    ["Can you hold it for me?", "[48 hours], sure. Just ask."],
    ["Will you get more?", "Nope — everything's one of one."],
    ["More photos?", "Always. Ask away."],
    ["How do I wash it?", "Check the listing notes. When in doubt, take it somewhere that knows vintage."],
   ],
  },
  about: { heading: "", body: "", contactHeading: "", contactNote: "" },
 },
 vitrine: {
  auth: {
   lede: "Each piece is examined before it is shown.",
   steps: "Construction | Seams, linings and hardware, read against the house and the decade. | | | \nLabels | Dated to the years they were in use. | | | \nMaterials | Fibre content checked against the label and the hand of the cloth. | | | ",
   closing: "Where certainty isn't possible, the listing says so and the price reflects it.",
  },
  shipping: {
   lede: "Sent tracked and insured. Wrapped to arrive as it left.",
   faq: [
    ["Dispatch", "Within [2 business days], tracked."],
    ["Cost", "[Flat rate] domestic, complimentary over $[AMOUNT]. International at checkout."],
    ["Returns", "[14 days] from delivery, unworn."],
    ["Damage", "Photograph before unwrapping further, and write the same day."],
   ],
  },
  faq: {
   lede: "",
   items: [
    ["Sizing", "Measured flat, in inches, listed as taken. Compare with something you own."],
    ["Condition", "Photographed rather than described around."],
    ["Holds", "[48 hours], on request."],
    ["Restocks", "None. Every piece is singular."],
    ["Further images", "On request, same day."],
    ["Care", "Noted on each listing."],
   ],
  },
  about: { heading: "", body: "", contactHeading: "", contactNote: "" },
 },
 "corner-shop": {
  auth: {
   lede: "We check everything before it goes on the rail — same as we would if you were standing here asking.",
   steps: "We look it over | Seams, linings, hardware, all of it, against how that maker actually built things. | | | \nWe read the labels | Brand and care labels get dated to when they were really in use. | | | \nWe check the fabric | The label says one thing; the cloth tells you if that's true. | | | ",
   closing: "If we're not certain, we'll tell you straight and price it accordingly. Come in and look at it yourself if you'd rather.",
  },
  shipping: {
   lede: "Shipped quickly, or come and collect it — whichever suits.",
   faq: [
    ["When does it go out?", "Within [2 business days], tracked."],
    ["What's the cost?", "[Flat rate], free over $[AMOUNT]."],
    ["Can I collect in person?", "Yes — choose collection at checkout and we'll hold it at [ADDRESS] for [7 days]."],
    ["Returns?", "[14 days], unworn. Bring it in or post it back."],
   ],
  },
  faq: { lede: "", items: [] },
  about: {
   heading: "About the shop",
   body: "[Who you are, how long you've been on this street, and what you're known for. Two or three paragraphs — this is the page that turns an online browser into someone who walks in.]",
   contactHeading: "Come say hello",
   contactNote: "[ADDRESS] · open [DAYS, HOURS]. Or send a message and we'll get back to you.",
  },
 },
};

const AUTHORED_TEMPLATES: StorefrontTemplate[] = [
 // ─────────────────────────────────────────────────────────────────────────────────────────────
 // 1 · HEIRLOOM — collector's editorial. Belief interrupts the product flow, twice.
 // ─────────────────────────────────────────────────────────────────────────────────────────────
 {
  id: "elegant",
  name: "Elegant",
  description: "Type on paper, wide margins, and two statements of belief that break up the browsing. For a small, expensive, opinionated edit.",
  bestFor: "Few pieces, high prices, and a point of view.",
  signature: "Two statement blocks interrupt the product flow at fixed points, so browsing is punctuated by belief rather than ending in it.",
  // Brass darkened from the study's #8A6B3F, which measured 3.9:1 on this ground — below the floor
  // for the 13px prices the accent also colours. This holds ~5:1 and keeps the same warmth.
  colors: { bg: "#F4EFE6", text: "#1C1917", accent: "#7A5C33" },
  fonts: { heading: "Cormorant Garamond", body: "Karla" },
  radius: "sharp",
  headerLayout: "center",
  heroStyle: "minimal",
  grid: { cols: 3, ratio: "4/5", gutter: "wide" },
  productLayout: "rail",
  layout: [
   { type: "announcement", variant: "quiet", props: { text: SHIP_LINE } },
   { type: "hero", variant: "stack", props: { heading: "Objects that outlive us", subtext: "A small edit of vintage, chosen to be kept.", cta: "Shop the edit", image: "" } },
   { type: "image", variant: "full", props: { image: "", caption: "" } },
   { type: "statement", variant: "large", props: { quote: "Each piece is curated for the collector, not the consumer.", attribution: "" }, style: { bg: "accent" } },
   { type: "collections", variant: "grid", props: { heading: "Browse", items: SAFE_TILES, cols: "3" } },
   { type: "featured", variant: "grid", props: { heading: "The Current Edit", limit: "6", cols: "3" } },
   { type: "split", variant: "half", props: { heading: "Condition, stated plainly", body: "Every piece is measured flat and photographed in daylight. Wear is noted in the listing — we would rather you know than be surprised.", cta: "Our condition scale", image: "", imageSide: "left" } },
   { type: "statement", variant: "boxed", props: { quote: "Nothing here was made this year, and nothing here was made twice.", attribution: "" } },
   { type: "gallery", variant: "loose", props: { images: "" } },
   { type: "newsletter", variant: "centered", props: { heading: "The list", subtext: "New pieces, roughly [once a month]. Nothing else.", cta: "Sign up" } },
  ],
  shop: [
   { type: "text", variant: "lede", props: { heading: "Everything available", body: "Sorted newest first. Sold pieces stay visible — they're part of the record." } },
  ],
  pages: [
   {
    slug: "philosophy", title: "Philosophy",
    blocks: [
     { type: "text", variant: "editorial", props: { heading: "Why this store exists", body: "[Two or three paragraphs on what you look for and why. Write it as though you were explaining it to someone in the shop — the specific thing you keep buying, the thing you refuse to.]" } },
     { type: "statement", variant: "large", props: { quote: "Each piece is curated for the collector, not the consumer.", attribution: "" }, style: { bg: "accent" } },
     { type: "columns", variant: "claims", props: { heading: "How we buy", items: "Slowly | We would rather list four pieces a month than forty. | | | \nIn person | Nothing is bought from a photograph alone. | | | \nOnce | No restocks, no reorders, no second chances. | | | ", cols: "3" } },
    ],
   },
   {
    slug: "authenticity", title: "Authenticity",
    blocks: [
     { type: "text", variant: "lede", props: { heading: "How we verify", body: "Every piece is checked before it is listed. Here is exactly what that means." } },
     { type: "columns", variant: "steps", props: { heading: "", items: "Construction | Seams, linings and hardware are compared against period-correct references. | | | \nLabels | Brand, care and union labels are dated to the era they were used. | | | \nMaterials | Fibre content is checked against the label and against the hand of the cloth. | | | ", cols: "3" } },
     { type: "text", variant: "centered", props: { heading: "If we can't be certain", body: "We say so in the listing, and we price it accordingly. A piece we can't date is described as unsigned rather than attributed to a house it may not belong to." } },
    ],
   },
   {
    slug: "condition-scale", title: "Condition Scale",
    blocks: [
     { type: "text", variant: "lede", props: { heading: "Condition scale", body: "The same four words on every listing, meaning the same four things every time." } },
     { type: "faq", variant: "index", props: { heading: "", subtext: "", q0: "Excellent", a0: "No visible wear. May be deadstock or barely worn.", q1: "Very good", a1: "Light wear consistent with age, nothing that draws the eye when worn.", q2: "Good", a2: "Visible wear — noted and photographed in the listing. Still entirely wearable.", q3: "As-is", a3: "A fault we have decided not to repair, described and photographed in full. Priced for it." } },
     { type: "text", variant: "centered", props: { heading: "Measurements", body: "Every piece is measured flat, in inches, and listed as taken — chest, waist, length, sleeve. Vintage sizing is not modern sizing, so measure something you own and compare." } },
    ],
   },
   {
    slug: "contact", title: "Contact",
    blocks: [
     { type: "contact", variant: "split", props: { heading: "Get in touch", subtext: "Questions on fit, condition or a specific piece — we answer within [1 business day].", email: "[YOUR EMAIL]", cta: "Send" } },
    ],
   },
    ...standardPages("heirloom", STANDARD_COPY["heirloom"], ["authentication", "about"]),
 ],
 },

 // ─────────────────────────────────────────────────────────────────────────────────────────────
 // 2 · PROVENANCE — authenticated archive. Two taxonomies: by label, and by era.
 // ─────────────────────────────────────────────────────────────────────────────────────────────
 {
  id: "archival",
  name: "Archival",
  description: "Built for the two questions a designer buyer always asks: is it real, and when is it from. Deep taxonomy and visible proof.",
  bestFor: "Designer and archive sellers where authentication is the sale.",
  signature: "A label wall and an era timeline as two separate full-width sections — the catalogue can be entered from either direction.",
  colors: { bg: "#FAF9F7", text: "#14100E", accent: "#6C2126" },
  fonts: { heading: "Spectral", body: "Libre Franklin" },
  radius: "sharp",
  headerLayout: "split",
  heroStyle: "text-over-image",
  grid: { cols: 4, ratio: "5/6", gutter: "normal" },
  productLayout: "rail",
  layout: [
   { type: "announcement", variant: "bar", props: { text: "All pieces authenticated in house · Ships worldwide" } },
   { type: "hero", variant: "bleed", props: { heading: "Documented, dated, verified", subtext: "Archive and designer pieces, each one authenticated before it is listed.", cta: "Shop all", image: "" }, style: { align: "left" } },
   { type: "columns", variant: "claims", props: { heading: "", items: "Authenticated in house | | | | \nDated to the season | | | | \nMeasured flat | | | | \nShips worldwide | | | | ", cols: "4" } },
   { type: "featured", variant: "grid", props: { heading: "New Arrivals", limit: "8", cols: "4" } },
   // Ships with garment categories, not designer names. Onboarding swaps these for the labels the
   // store actually carries — an invented house here is the placeholder-tile trap.
   { type: "collections", variant: "list", props: { heading: "Shop by label", items: SAFE_TILES } },
   { type: "collections", variant: "row", props: { heading: "Shop by era", items: "1960s\n1970s\n1980s\n1990s\n2000s\n2010s" } },
   { type: "split", variant: "panel", props: { heading: "How we authenticate", body: "Construction, labels and materials are checked against period references before a piece is listed. Where a piece is documented — a runway look, an editorial — we say where.", cta: "Our process", image: "", imageSide: "right" } },
   { type: "blog", variant: "feature", props: { heading: "From the Journal", items: "[Post title] | [One line on what it covers.] | | \n[Post title] | [One line on what it covers.] | | \n[Post title] | [One line on what it covers.] | | " } },
   { type: "testimonials", variant: "plain", props: { heading: "", items: "[Quote from a real customer.] | [Name]\n[Quote from a real customer.] | [Name]\n[Quote from a real customer.] | [Name]" } },
   { type: "newsletter", variant: "split", props: { heading: "First access", subtext: "New arrivals and archive finds, sent before they're public.", cta: "Subscribe" } },
  ],
  shop: [
   { type: "collections", variant: "row", props: { heading: "Shop by era", items: "1960s\n1970s\n1980s\n1990s\n2000s\n2010s" } },
  ],
  pages: [
   {
    slug: "authentication", title: "Authentication",
    blocks: [
     { type: "text", variant: "lede", props: { heading: "Authentication", body: "Every piece is verified in house before it is listed. Nothing is sold on a maybe." } },
     { type: "columns", variant: "steps", props: { heading: "", items: "Construction | Seams, linings, hardware and finishing are compared against period-correct references for the house. | | | \nLabels | Brand, care, size and union labels are dated — label design changes are often the clearest evidence of a season. | | | \nMaterials | Fibre content, weight and hand are checked against the label and the era. | | | \nDocumentation | Where a piece appeared on a runway or in an editorial, we cite it in the listing. | | | ", cols: "2" } },
     { type: "statement", variant: "boxed", props: { quote: "If we cannot date a piece with confidence, the listing says so.", attribution: "" } },
     { type: "faq", variant: "sided", props: { heading: "Common questions", subtext: "", q0: "Do you provide a certificate?", a0: "Every order includes a written authentication note stating the house, the season where known, and what the piece was checked against.", q1: "What if I have it authenticated elsewhere and it fails?", a1: "Return it within [14] days with the third-party report and we refund in full, including shipping both ways.", q2: "Do you authenticate pieces I already own?", a2: "[Yes — see Sell To Us for how to send photographs. / Not at the moment.]" } },
    ],
   },
   {
    slug: "sell-to-us", title: "Sell To Us",
    blocks: [
     { type: "text", variant: "lede", props: { heading: "Sell to us", body: "We buy archive and designer pieces outright, and take selected pieces on consignment." } },
     { type: "columns", variant: "steps", props: { heading: "How it works", items: "Send photographs | Front, back, labels, hardware and any faults. Include measurements if you have them. | | | \nWe respond | An offer or a consignment rate within [2 business days]. | | | \nShip it in | We send a prepaid label. Payment lands within [3 days] of the piece arriving and matching its photographs. | | | ", cols: "3" } },
     { type: "text", variant: "centered", props: { heading: "What we look for", body: "Designer and archive pieces from [the eras you buy]. Condition matters less than provenance — a documented piece with wear is more interesting to us than an anonymous one without." } },
     { type: "contact", variant: "form", props: { heading: "Send us a piece", subtext: "Tell us what you have. Photographs can follow by email.", email: "[YOUR EMAIL]", cta: "Send" } },
    ],
   },
   {
    slug: "journal", title: "Journal",
    blocks: [
     { type: "text", variant: "lede", props: { heading: "The Journal", body: "Notes on the houses, the seasons and the pieces we keep coming back to." } },
     { type: "blog", variant: "list", props: { heading: "", items: "[Post title] | [One line on what it covers.] | | \n[Post title] | [One line on what it covers.] | | \n[Post title] | [One line on what it covers.] | | \n[Post title] | [One line on what it covers.] | | " } },
    ],
   },
   {
    slug: "faq", title: "FAQ",
    blocks: [
     { type: "faq", variant: "two-column", props: { heading: "Frequently asked", subtext: "", q0: "How are pieces dated?", a0: "By label design, construction and materials, cross-referenced against period sources. The listing states how confident we are.", q1: "Are measurements included?", a1: "Yes — every piece is measured flat, in inches. Vintage sizing does not match modern sizing, so measure a piece you own and compare.", q2: "Do you ship internationally?", a2: "Yes. Duties and import charges are the buyer's responsibility.", q3: "What is your returns policy?", a3: RETURNS_BODY, q4: "Do you hold pieces?", a4: "[We hold for 24 hours on request. / We can't hold pieces.]", q5: "Can I see more photographs?", a5: "Always — email us the listing and we'll send more, including any fault in close-up." } },
    ],
   },
    ...standardPages("provenance", STANDARD_COPY["provenance"], ["authentication", "faq"]),
 ],
 },

 // ─────────────────────────────────────────────────────────────────────────────────────────────
 // 3 · THE INDEX — deep catalogue. The shortest homepage in the set, on purpose.
 // ─────────────────────────────────────────────────────────────────────────────────────────────
 {
  id: "catalogue",
  name: "Catalogue",
  description: "Five sections and out. For a store with hundreds of pieces, where the homepage's only job is getting a shopper into the catalogue.",
  bestFor: "Hundreds of pieces, where finding is the hard part.",
  signature: "No hero photograph at all — the page opens on the catalogue count and a row of category shortcuts, so the first thing a shopper can do is narrow it.",
  colors: { bg: "#F7F7F5", text: "#17181A", accent: "#2F4739" },
  fonts: { heading: "Instrument Sans", body: "Instrument Sans" },
  radius: "soft",
  headerLayout: "inline",
  heroStyle: "minimal",
  grid: { cols: 5, ratio: "4/5", gutter: "tight" },
  productLayout: "classic",
  layout: [
   { type: "announcement", variant: "bar", props: { text: `New pieces every [weekday] · ${SHIP_LINE}` } },
   { type: "hero", variant: "stack", props: { heading: "[000] pieces. Narrow it down.", subtext: "Every piece one of one, sorted newest first.", cta: "Shop all", image: "" } },
   { type: "collections", variant: "circles", props: { heading: "", items: SAFE_TILES } },
   { type: "collections", variant: "grid", props: { heading: "Shop by category", items: SAFE_TILES, cols: "3" } },
   { type: "featured", variant: "grid", props: { heading: "Just added", limit: "10", cols: "5" } },
   { type: "split", variant: "stacked", props: { heading: "New every [week]", body: "We list [00–00] pieces a [week]. Follow the newsletter if you'd rather not check.", cta: "Shop all", image: "", imageSide: "left" } },
  ],
  shop: [
   { type: "collections", variant: "row", props: { heading: "", items: SAFE_TILES } },
  ],
  pages: [
   {
    slug: "the-edits", title: "The Edits",
    blocks: [
     { type: "text", variant: "lede", props: { heading: "The Edits", body: "Smaller cuts of the catalogue, grouped by hand. Easier than filters when you don't know what you're looking for yet." } },
     { type: "collections", variant: "duo", props: { heading: "", items: "[Edit name]\n[Edit name]" } },
     { type: "collections", variant: "grid", props: { heading: "Everything else", items: SAFE_TILES, cols: "3" } },
    ],
   },
   {
    slug: "sourcing-requests", title: "Sourcing Requests",
    blocks: [
     { type: "text", variant: "lede", props: { heading: "Looking for something specific?", body: "Tell us what it is. We source [00] pieces a [week] and keep a list of what people are after." } },
     { type: "columns", variant: "steps", props: { heading: "", items: "Describe it | Brand, era, size, colour — whatever you know. A reference photograph helps most. | | | \nWe look | You go on the list. Most requests are filled within [4–6 weeks]. | | | \nFirst refusal | If it turns up, you see it before it's listed. No obligation. | | | ", cols: "3" } },
     { type: "contact", variant: "card", props: { heading: "Send a request", subtext: "No fee, no commitment.", email: "[YOUR EMAIL]", cta: "Send request" } },
    ],
   },
   {
    slug: "faq", title: "FAQ",
    blocks: [
     { type: "faq", variant: "index", props: { heading: "FAQ", subtext: "", q0: "How often do you list?", a0: "[00–00] new pieces every [weekday].", q1: "How does sizing work?", a1: "Every piece is measured flat in inches. Vintage sizing runs small — compare against something you already own rather than the label.", q2: "Do you hold pieces?", a2: "[We hold for 24 hours on request. / We can't hold pieces.]", q3: "Shipping", a3: `${SHIP_LINE}. Orders ship within [1–2] business days from [YOUR CITY].`, q4: "Returns", a4: RETURNS_BODY, q5: "Do you ship internationally?", a5: "Yes. Duties and import charges are the buyer's responsibility." } },
    ],
   },
    ...standardPages("the-index", STANDARD_COPY["the-index"], ["faq"]),
 ],
 },

 // ─────────────────────────────────────────────────────────────────────────────────────────────
 // 4 · DROP — release cadence. The only template that leads with a number instead of an image.
 // ─────────────────────────────────────────────────────────────────────────────────────────────
 {
  id: "bold",
  name: "Bold",
  description: "A countdown above everything, poster type, and sold pieces left in the grid on purpose. For stores that release in timed batches.",
  bestFor: "Timed releases that sell out.",
  signature: "The countdown sits above the hero — before the store introduces itself. Sold pieces stay in the grid, because sell-through is the proof.",
  colors: { bg: "#FFFFFF", text: "#0A0A0A", accent: "#C40025" },
  fonts: { heading: "Archivo", body: "Archivo" },
  radius: "sharp",
  headerLayout: "center",
  heroStyle: "drop-banner",
  grid: { cols: 4, ratio: "1/1", gutter: "normal" },
  productLayout: "classic",
  layout: [
   { type: "countdown", variant: "display", props: { heading: "Next drop", subtext: "[DROP DAY], [TIME] [TZ]. Online only for [44] hours.", date: "", cta: "", ctaHref: "" } },
   { type: "announcement", variant: "ticker", props: { text: `${SHIP_LINE} · One of one · No restocks` } },
   { type: "hero", variant: "stack", props: { heading: "THE GOOD PIECES DON'T WAIT", subtext: "New pieces drop every [DROP DAY] at [TIME] [TZ].", cta: "Shop this drop", image: "" } },
   { type: "gallery", variant: "grid", props: { images: "", cols: "3" } },
   { type: "marquee", variant: "scroll", props: { items: "New drop\nOne of one\nNo restocks\nSold out fast", sep: "✦" } },
   { type: "featured", variant: "grid", props: { heading: "This drop", limit: "8", cols: "4" } },
   { type: "collections", variant: "row", props: { heading: "Past drops", items: "[Drop 01]\n[Drop 02]\n[Drop 03]\n[Drop 04]" } },
   { type: "newsletter", variant: "bar", props: { heading: "Drop alert", subtext: "One email, [DROP DAY] morning.", cta: "Notify me" } },
  ],
  shop: [
   { type: "text", variant: "lede", props: { heading: "Everything", body: "Sold pieces stay up. If it's still here, it's still available." } },
  ],
  pages: [
   {
    slug: "how-drops-work", title: "How Drops Work",
    blocks: [
     { type: "text", variant: "lede", props: { heading: "How drops work", body: "New pieces go online every [DROP DAY] at [TIME] [TZ]. Each drop is online exclusive for [44] hours." } },
     { type: "columns", variant: "steps", props: { heading: "", items: "Preview | The full drop is posted on [@YOURHANDLE] the night before. Nothing is held. | | | \nDrop | Pieces go live at [TIME] [TZ] exactly. First to checkout takes it — nothing is reserved by adding to cart. | | | \nAfter | Anything left [goes in store on [DAY] at [TIME] / stays online]. | | | ", cols: "3" } },
     { type: "statement", variant: "large", props: { quote: "One of one. No restocks. When it's gone it's gone.", attribution: "" }, style: { bg: "dark" } },
     { type: "countdown", variant: "strip", props: { heading: "Next drop", subtext: "", date: "", cta: "", ctaHref: "" } },
    ],
   },
   {
    slug: "drop-archive", title: "Drop Archive",
    blocks: [
     { type: "text", variant: "lede", props: { heading: "Drop archive", body: "Every drop so far. Sold pieces stay up — this is the record." } },
     { type: "collections", variant: "grid", props: { heading: "", items: "[Drop 01]\n[Drop 02]\n[Drop 03]\n[Drop 04]\n[Drop 05]\n[Drop 06]", cols: "3" } },
    ],
   },
   {
    slug: "faq", title: "FAQ",
    blocks: [
     { type: "faq", variant: "accordion", props: { heading: "FAQ", subtext: "", q0: "When is the next drop?", a0: "Every [DROP DAY] at [TIME] [TZ]. The countdown on the homepage is the exact time.", q1: "Does adding to cart hold a piece?", a1: "No. Pieces are only yours at checkout.", q2: "Do you restock?", a2: "Never. Every piece is one of one.", q3: "Why are sold items still showing?", a3: "So you can see what went. It's also the fastest way to tell what sizes and styles move.", q4: "Shipping", a4: `${SHIP_LINE}. Orders ship within [1–2] business days from [YOUR CITY].`, q5: "Returns", a5: RETURNS_BODY } },
     // Even the thinnest template needs a way to be reached. A drop store gets sizing questions
     // between releases, and "DM us" is not a channel we can route to the store's inbox.
     { type: "contact", variant: "form", props: { heading: "Still stuck?", subtext: "Sizing, an order, a piece you missed — send a note.", email: "[YOUR EMAIL]", cta: "Send" } },
    ],
   },
    ...standardPages("drop", STANDARD_COPY["drop"], ["faq"]),
 ],
 },

 // ─────────────────────────────────────────────────────────────────────────────────────────────
 // 5 · DEAR READER — founder voice. The letter does the work a brand statement can't.
 // ─────────────────────────────────────────────────────────────────────────────────────────────
 {
  id: "editorial",
  name: "Editorial",
  description: "A letter at reading width immediately after the hero, and section headings written as asides. For a solo seller whose personality is the differentiator.",
  bestFor: "Solo sellers — you're buying from a person and the site says so.",
  signature: "A full-width letter in the seller's own voice sits directly under the hero, set at reading width in the body serif. Not a brand statement — an actual note.",
  colors: { bg: "#FDF6F0", text: "#2B211D", accent: "#8A3F49" },
  fonts: { heading: "Bricolage Grotesque", body: "Newsreader" },
  radius: "soft",
  headerLayout: "inline",
  heroStyle: "text-over-image",
  grid: { cols: 3, ratio: "4/5", gutter: "normal" },
  productLayout: "stacked",
  layout: [
   { type: "hero", variant: "split", props: { heading: "Okay so — you're here", subtext: "Vintage I found, wore, and eventually let go of.", cta: "Have a look", image: "", imageSide: "left" } },
   { type: "text", variant: "editorial", props: { heading: "Why I started this", body: "[Write this one yourself — it's the whole template. Why you started, what you were doing before, what you keep buying that you shouldn't. Three or four paragraphs, the way you'd say it out loud. Don't tidy it up too much.]" } },
   { type: "featured", variant: "grid", props: { heading: "Things I can't stop thinking about", limit: "6", cols: "3" } },
   { type: "split", variant: "offset", props: { heading: "Before it goes up", body: "Everything is washed or dry-cleaned, mended where it needs it, measured, and photographed on [a hanger / me] so you can see how it actually hangs.", cta: "", image: "", imageSide: "right" } },
   { type: "testimonials", variant: "plain", props: { heading: "What people say", items: "[Quote from a real customer.] | [Name]\n[Quote from a real customer.] | [Name]\n[Quote from a real customer.] | [Name]" } },
   { type: "gallery", variant: "loose", props: { images: "" } },
   { type: "newsletter", variant: "centered", props: { heading: "Stay in touch", subtext: "A note when something new goes up. That's it.", cta: "Sign up" } },
  ],
  shop: [
   { type: "text", variant: "lede", props: { heading: "Everything that's up right now", body: "Newest first. If something's sold it stays up — I like seeing where things went." } },
  ],
  pages: [
   {
    slug: "our-story", title: "Our Story",
    blocks: [
     { type: "text", variant: "editorial", props: { heading: "The longer version", body: "[The full story — where it started, what you were doing before, how you source now. Long-form is the point on this page: write as much as you actually have to say.]" } },
     { type: "image", variant: "inset", props: { image: "", caption: "[Where this was taken.]" } },
     { type: "text", variant: "columns", props: { heading: "How I source", body: "[Where you go, how often, what you're looking for. The specifics are what make this readable — name the markets, the days, the things you always check first.]" } },
     { type: "statement", variant: "side", props: { quote: "[One line you actually believe about buying clothes.]", attribution: "[YOUR NAME]" } },
    ],
   },
   {
    // "shipping", not "shipping-returns": every other template uses "shipping" for this
    // page, and applyTemplate dedupes by SLUG — so the odd one out slipped past the check
    // and a store that tried Editorial plus any other template ended up with two
    // "Shipping & Returns" entries in its nav.
    slug: "shipping", title: "Shipping & Returns",
    blocks: [
     { type: "text", variant: "lede", props: { heading: "Shipping & returns", body: "The short version: it ships fast, and if something's wrong I'll fix it." } },
     { type: "faq", variant: "accordion", props: { heading: "", subtext: "", q0: "How fast does it ship?", a0: `Within [1–2] business days from [YOUR CITY]. ${SHIP_LINE}.`, q1: "Do you ship internationally?", a1: "[Yes — duties are on you, sorry. / Not yet.]", q2: "Can I return something?", a2: RETURNS_BODY, q3: "It arrived damaged", a3: "Email me a photograph within [7] days and I'll refund you, including shipping. No argument." } },
    ],
   },
   {
    slug: "contact", title: "Contact",
    blocks: [
     { type: "contact", variant: "form", props: { heading: "Say hi", subtext: "Questions about a piece, sizing, anything — I answer everything myself, usually same day.", email: "[YOUR EMAIL]", cta: "Send" } },
    ],
   },
    ...standardPages("dear-reader", STANDARD_COPY["dear-reader"], ["shipping", "about"]),
 ],
 },

 // ─────────────────────────────────────────────────────────────────────────────────────────────
 // 6 · SUGAR — Y2K maximalist. Ten sections, tightest spacing, categories named by feeling.
 // ─────────────────────────────────────────────────────────────────────────────────────────────
 {
  id: "playful",
  name: "Playful",
  description: "Ten sections, tight gutters, and categories named by occasion rather than garment. Loud, fast, and built for a younger audience.",
  bestFor: "Dense, trend-fluent inventory and a younger crowd.",
  signature: "Categories named by occasion and feeling — club, off-duty, dressed up — rather than garment type. Each maps to a collection the seller actually curates.",
  colors: { bg: "#FFF0F5", text: "#241019", accent: "#D6006E" },
  fonts: { heading: "Syne", body: "DM Sans" },
  radius: "round",
  headerLayout: "center",
  heroStyle: "carousel",
  grid: { cols: 4, ratio: "1/1", gutter: "tight" },
  productLayout: "classic",
  layout: [
   { type: "announcement", variant: "ticker", props: { text: `new stuff [weekly] · ${SHIP_LINE.toLowerCase()}` } },
   { type: "hero", variant: "frame", props: { heading: "everything, all at once", subtext: "one-of-one vintage, [weekly] drops, nothing you'll see on anyone else.", cta: "shop it", image: "" } },
   { type: "marquee", variant: "display", props: { items: "one of one\nnew [weekly]\nno restocks\nsize inclusive", sep: "✦" } },
   { type: "featured", variant: "grid", props: { heading: "just in", limit: "8", cols: "4" } },
   // Vibe tiles are the signature move. They resolve once the seller builds collections with these
   // names — onboarding creates them. Until then a tile falls back to the full catalogue rather
   // than an empty aisle (see the category fallback in StorefrontView).
   { type: "collections", variant: "grid", props: { heading: "shop by vibe", items: "going out top\noff duty\ndressed up\nclub\nsummer\nbasics", cols: "3" } },
   { type: "text", variant: "centered", props: { heading: "what this is", body: "[a couple of lines on what you sell and who it's for. keep it short — this is a caption, not an essay.]" } },
   { type: "statement", variant: "large", props: { quote: "play dress up with us", attribution: "" }, style: { bg: "accent" } },
   { type: "gallery", variant: "grid", props: { images: "", cols: "4" } },
   { type: "testimonials", variant: "cards", props: { heading: "what you said", items: "[Quote from a real customer.] | [Name]\n[Quote from a real customer.] | [Name]\n[Quote from a real customer.] | [Name]" } },
   { type: "newsletter", variant: "centered", props: { heading: "get on the list", subtext: "first look at every drop.", cta: "sign up" } },
  ],
  shop: [
   { type: "collections", variant: "row", props: { heading: "shop by vibe", items: "going out top\noff duty\ndressed up\nclub\nsummer\nbasics" } },
  ],
  pages: [
   {
    slug: "story", title: "Story",
    blocks: [
     { type: "text", variant: "lede", props: { heading: "hi, hello", body: "[who you are and why you started this. two or three short paragraphs — write it like a caption, not a press release.]" } },
     { type: "gallery", variant: "mosaic", props: { images: "" } },
     { type: "columns", variant: "claims", props: { heading: "the rules", items: "one of one | nothing gets restocked, ever. | | | \nsize inclusive | measured flat, every listing. | | | \nfast shipping | out within [1–2] days. | | | ", cols: "3" } },
    ],
   },
   {
    slug: "contact", title: "Contact",
    blocks: [
     { type: "contact", variant: "card", props: { heading: "talk to us", subtext: "sizing, fit, anything — dm [@YOURHANDLE] or use this.", email: "[YOUR EMAIL]", cta: "send" } },
     { type: "faq", variant: "cards", props: { heading: "quick answers", subtext: "", q0: "shipping?", a0: `out within [1–2] business days. ${SHIP_LINE.toLowerCase()}.`, q1: "returns?", a1: "all sales final unless it arrives damaged or isn't as described — then email within [7] days.", q2: "sizing?", a2: "every piece is measured flat. vintage runs small, so compare to something you own." } },
    ],
   },
    ...standardPages("sugar", STANDARD_COPY["sugar"], ["about"]),
 ],
 },

 // ─────────────────────────────────────────────────────────────────────────────────────────────
 // 7 · VITRINE — gallery minimal. Two products per row, and prose between the images.
 // ─────────────────────────────────────────────────────────────────────────────────────────────
 {
  id: "curated",
  name: "Curated",
  description: "Two products per row at enormous size, with written descriptions and two text blocks breaking up the images. Minimal in tone, not in words.",
  bestFor: "Genuinely excellent photography and few, expensive pieces.",
  signature: "A 2-up product grid where everything else runs three to five — the largest layout deviation in the set. It only works if the photography carries it.",
  // Monochrome by design: the study's warm grey measured fine for rules but the accent also colours
  // 13px prices, and this template's whole accessibility risk is metadata set too light. Ink it is.
  colors: { bg: "#FFFFFF", text: "#111111", accent: "#111111" },
  fonts: { heading: "Schibsted Grotesk", body: "Schibsted Grotesk" },
  radius: "sharp",
  headerLayout: "center",
  heroStyle: "minimal",
  grid: { cols: 2, ratio: "4/5", gutter: "wide" },
  productLayout: "stacked",
  layout: [
   { type: "hero", variant: "stack", props: { heading: "Six pieces. That's the edit.", subtext: "", cta: "View", image: "" } },
   { type: "text", variant: "centered", props: { heading: "", body: "[One paragraph on what this is. One. The photography is doing the work — this is here so the page has a voice, not so it has copy.]" } },
   { type: "featured", variant: "grid", props: { heading: "", limit: "4", cols: "2" } },
   { type: "image", variant: "full", props: { image: "", caption: "" } },
   { type: "text", variant: "centered", props: { heading: "On condition", body: "Every piece is measured flat and photographed in daylight, unstyled and unretouched. Wear is shown rather than described." } },
   { type: "featured", variant: "grid", props: { heading: "", limit: "4", cols: "2" } },
   { type: "newsletter", variant: "centered", props: { heading: "", subtext: "New pieces, [monthly].", cta: "Sign up" } },
  ],
  shop: [
   { type: "text", variant: "centered", props: { heading: "", body: "Everything available. Sold pieces remain visible." } },
  ],
  pages: [
   {
    slug: "about", title: "About",
    blocks: [
     { type: "text", variant: "editorial", props: { heading: "About", body: "[One screen. Not two. What you sell, how you choose it, and where you are. Say it once and stop.]" } },
     { type: "image", variant: "inset", props: { image: "", caption: "" } },
    ],
   },
   {
    slug: "contact", title: "Contact",
    blocks: [
     { type: "contact", variant: "form", props: { heading: "Contact", subtext: "", email: "[YOUR EMAIL]", cta: "Send" } },
    ],
   },
    ...standardPages("vitrine", STANDARD_COPY["vitrine"], ["about"]),
 ],
 },

 // ─────────────────────────────────────────────────────────────────────────────────────────────
 // 8 · CORNER SHOP — bricks and mortar. The only template where products come after the address.
 // ─────────────────────────────────────────────────────────────────────────────────────────────
 {
  id: "local",
  name: "Local",
  description: "Address, today's hours and a map above the first product, plus consignment intake and a real contact form. For a store that is a place first.",
  bestFor: "A physical location, consignment intake, or a pop-up schedule.",
  signature: "The shop card — address, today's hours and a map link — sits above the first product. Every other template opens with commerce; this one opens with an invitation.",
  colors: { bg: "#F5F2E8", text: "#1F2421", accent: "#2D5F4C" },
  fonts: { heading: "Zilla Slab", body: "Public Sans" },
  radius: "soft",
  headerLayout: "stacked",
  heroStyle: "logo-masthead",
  grid: { cols: 4, ratio: "1/1", gutter: "normal" },
  productLayout: "classic",
  layout: [
   { type: "announcement", variant: "bar", props: { text: "Open today [11am–6pm] · [YOUR STREET ADDRESS]" } },
   { type: "hero", variant: "split", props: { heading: "Sourced abroad, styled here", subtext: "Shop online, or come see it in [YOUR NEIGHBOURHOOD].", cta: "Shop online", image: "", imageSide: "right" } },
   { type: "split", variant: "panel", props: { heading: "Visit the shop", body: "[YOUR STREET ADDRESS]\n[CITY, STATE ZIP]\n\nMon–Fri [11am–6pm]\nSat [10am–6pm]\nSun [12pm–5pm]\n\n[PHONE]", cta: "Get directions", image: "", imageSide: "left" } },
   { type: "featured", variant: "grid", props: { heading: "Just dropped", limit: "8", cols: "4" } },
   { type: "columns", variant: "image", props: { heading: "", items: "Shop online | Everything on the floor, listed and shipped from the shop. | | Shop all | \nVisit us | [YOUR NEIGHBOURHOOD], open [six days a week]. | | Directions | \nConsign with us | Bring in pieces [Tues–Thurs], no appointment needed. | | How it works | ", cols: "3" } },
   { type: "faq", variant: "numbered", props: { heading: "How consignment works", subtext: "", q0: "Bring your pieces in", a0: "[Tues–Thurs, 11am–4pm]. No appointment needed. We take [up to 20] pieces per visit.", q1: "We price them together", a1: "You'll see the price before anything goes on the floor. Nothing is listed without your say-so.", q2: "You take [50%]", a2: "Paid out [monthly] by [check or transfer], on anything that sold that month.", q3: "Unsold pieces", a3: "Yours to collect after [90 days], or we donate them to [YOUR CHARITY] — your choice at intake." } },
   { type: "contact", variant: "split", props: { heading: "Get in touch", subtext: "Questions about a piece, consignment, or a private appointment.", email: "[YOUR EMAIL]", cta: "Send" } },
   { type: "newsletter", variant: "bar", props: { heading: "What's new in store", subtext: "New arrivals and pop-up dates, [monthly].", cta: "Sign up" } },
  ],
  shop: [
   { type: "text", variant: "lede", props: { heading: "Shop online", body: "Everything here is also on the floor at [YOUR STREET ADDRESS]. Local pickup is free — choose it at checkout." } },
  ],
  pages: [
   {
    slug: "visit", title: "Visit",
    blocks: [
     { type: "text", variant: "lede", props: { heading: "Visit us", body: "[YOUR STREET ADDRESS], [CITY]. [One line on how to find it — the cross street, what's next door, where to park.]" } },
     { type: "columns", variant: "bordered", props: { heading: "Hours", items: "Mon–Fri | [11am–6pm] | | | \nSaturday | [10am–6pm] | | | \nSunday | [12pm–5pm] | | | ", cols: "3" } },
     { type: "image", variant: "full", props: { image: "", caption: "[The shopfront.]" } },
     { type: "text", variant: "centered", props: { heading: "Getting here", body: "[Transit, parking, and anything a first-time visitor would need to know. Include the nearest stop by name.]" } },
    ],
   },
   {
    slug: "consign", title: "Consign With Us",
    blocks: [
     { type: "text", variant: "lede", props: { heading: "Consign with us", body: "We take vintage and designer pieces in good condition, [Tues–Thurs, 11am–4pm]. No appointment needed." } },
     { type: "faq", variant: "numbered", props: { heading: "How it works", subtext: "", q0: "Bring your pieces in", a0: "[Up to 20] pieces per visit, clean and on hangers if you can.", q1: "We price them together", a1: "You see and approve every price before it goes on the floor.", q2: "You take [50%]", a2: "Paid [monthly] by [check or transfer] on whatever sold.", q3: "Unsold pieces", a3: "Collect them after [90 days], or we donate to [YOUR CHARITY]. You choose at intake." } },
     { type: "text", variant: "centered", props: { heading: "What we take", body: "[The eras, labels and categories you accept — and just as importantly, what you don't. Being specific here saves everyone a trip.]" } },
     { type: "contact", variant: "card", props: { heading: "Questions first?", subtext: "Send photographs and we'll tell you before you carry anything across town.", email: "[YOUR EMAIL]", cta: "Send" } },
    ],
   },
   {
    slug: "events", title: "Events & Pop-ups",
    blocks: [
     { type: "text", variant: "lede", props: { heading: "Events & pop-ups", body: "Where we'll be, and what's happening in the shop." } },
     { type: "blog", variant: "list", props: { heading: "", items: "[Event name] | [Date, time, and where.] | | \n[Event name] | [Date, time, and where.] | | \n[Event name] | [Date, time, and where.] | | " } },
     { type: "newsletter", variant: "split", props: { heading: "Never miss one", subtext: "Pop-up dates and in-store events, [monthly].", cta: "Sign up" } },
    ],
   },
   {
    slug: "faq", title: "FAQ",
    blocks: [
     { type: "faq", variant: "two-column", props: { heading: "FAQ", subtext: "", q0: "Can I pick up my online order?", a0: "Yes — choose local pickup at checkout, free. We'll email when it's ready, usually same day.", q1: "Do you hold pieces?", a1: "[24 hours by phone. / We can't hold pieces.]", q2: "Do you buy outright?", a2: "[Selected pieces — ask at intake. / We consign only.]", q3: "Are you wheelchair accessible?", a3: "[Say plainly whether the entrance is step-free and how wide the aisles are. People need to know before they travel.]", q4: "Shipping", a4: `${SHIP_LINE}. Orders ship within [1–2] business days.`, q5: "Returns", a5: RETURNS_BODY } },
    ],
   },
    ...standardPages("corner-shop", STANDARD_COPY["corner-shop"], ["faq"]),
 ],
 },
];

// ── Greeked on the way out ──
// The authored copy above is the reference — it says what each block is FOR, and whoever edits a
// template needs that. What ships (and what the specimen gallery renders) is lorem ipsum, so a
// storefront is judged on its layout rather than read as prose.
//
// Names, descriptions, taglines and page titles are deliberately NOT greeked: they're how a seller
// chooses a template and how the navigation reads. To ship the authored copy instead, export
// AUTHORED_TEMPLATES here — that is the whole switch.
export const STOREFRONT_TEMPLATES: StorefrontTemplate[] = AUTHORED_TEMPLATES.map((t) => ({
 ...t,
 layout: greekBlocks(t.layout),
 shop: greekBlocks(t.shop || []),
 pages: (t.pages || []).map((pg) => ({ ...pg, blocks: greekBlocks(pg.blocks) })),
}));

/**
 * Templates that existed before the eight-template rewrite. A store whose theme still names one keeps
 * resolving — to the closest replacement — so an old `theme.template` never leaves the picker blank or
 * throws away a store's saved look. (Colours, fonts and blocks live on the theme itself, so this only
 * affects which card shows as active and what a re-apply would produce.)
 */
const LEGACY_TEMPLATE_IDS: Record<string, string> = {
 // Pre-rename ids. Every storefront already built carries one of these on its row, so they have to
 // keep resolving forever — a rename is a display change, never a break.
 heirloom: "elegant",
 provenance: "archival",
 "the-index": "catalogue",
 drop: "bold",
 "dear-reader": "editorial",
 sugar: "playful",
 vitrine: "curated",
 "corner-shop": "local",
 // Older still, from before the eight-template rewrite.
 "editorial-luxe": "elegant",
 "archive-noir": "archival",
 "modern-minimal": "curated",
 "literary-archive": "editorial",
 romantic: "editorial",
 "warm-earthy": "local",
 "playful-drop": "playful",
};

export function getTemplate(id: string): StorefrontTemplate | undefined {
 const direct = STOREFRONT_TEMPLATES.find((t) => t.id === id);
 if (direct) return direct;
 const mapped = LEGACY_TEMPLATE_IDS[id];
 return mapped ? STOREFRONT_TEMPLATES.find((t) => t.id === mapped) : undefined;
}

/** Resolve any stored template id (including a retired one) to a live id. */
export function resolveTemplateId(id: string | undefined | null): string | undefined {
 return id ? getTemplate(id)?.id : undefined;
}

function toBlocks(specs: Spec[]): Block[] {
 return specs.map((s) => {
  const b = makeBlock(s.type, s.props);
  if (s.variant) b.variant = s.variant;
  if (s.style) b.style = s.style;
  return b;
 });
}

/** Fresh starter blocks for a template's HOME page (new ids each time). */
export function templateBlocks(id: string): Block[] {
 const t = getTemplate(id);
 return t ? toBlocks(t.layout) : [];
}

/** The sections a template puts ABOVE the catalogue on the Shop page. */
export function templateShopBlocks(id: string): Block[] {
 const t = getTemplate(id);
 return t ? toBlocks(t.shop) : [];
}

/** A template's other pages (About, Authentication, Visit, FAQ…), ready to store as theme.extraPages. */
export function templatePages(id: string): { slug: string; title: string; blocks: Block[] }[] {
 const t = getTemplate(id);
 return t ? t.pages.map((p) => ({ slug: p.slug, title: p.title, blocks: toBlocks(p.blocks) })) : [];
}

/** A template's catalogue-grid density, for theme.shopGrid. */
export function templateGrid(id: string): TemplateGrid | undefined {
 return getTemplate(id)?.grid;
}

/**
 * Everything applying a template writes to the theme, in one place — so the studio, the onboarding
 * wizard, the design API and the AI generator can't apply four different subsets of the same
 * template. Callers merge this over the existing theme.
 */
export function templateTheme(id: string) {
 const t = getTemplate(id);
 if (!t) return null;
 return {
  template: t.id,
  colors: { ...t.colors },
  fonts: { ...t.fonts },
  radius: t.radius,
  headerLayout: t.headerLayout,
  shopGrid: { ...t.grid },
  productLayout: t.productLayout,
  blocks: templateBlocks(t.id),
  shopBlocks: templateShopBlocks(t.id),
  extraPages: templatePages(t.id),
 };
}

// Curated fonts a store can swap to (Google Fonts — the storefront loads them by name). Kept to
// families that carry the 400/500/600/700 weights the loader requests, so no combination 400-errors.
export const HEADING_FONTS = [
 // Serif & display-serif — the fashion-editorial voice
 "Playfair Display", "Bodoni Moda", "Cormorant Garamond", "EB Garamond", "Newsreader", "Fraunces",
 "Lora", "Spectral", "Crimson Pro", "Source Serif 4", "Bitter", "Literata", "Domine", "Zilla Slab",
 // Sans & grotesque — modern, clean
 "Outfit", "Space Grotesk", "Archivo", "Montserrat", "Jost", "Syne", "Sora", "Bricolage Grotesque",
 "Epilogue", "Unbounded", "Poppins", "DM Sans", "Manrope", "Raleway", "Libre Franklin", "Chivo",
 "Instrument Sans", "Schibsted Grotesk",
];
export const BODY_FONTS = [
 "Inter", "Newsreader", "Poppins", "Montserrat", "Figtree", "Outfit", "Work Sans", "Nunito Sans",
 "Roboto", "DM Sans", "Manrope", "Hanken Grotesk", "Lexend", "Plus Jakarta Sans", "Public Sans",
 "Karla", "Mulish", "Rubik", "Raleway", "IBM Plex Sans", "Libre Franklin", "Lora", "EB Garamond",
 "Source Serif 4", "Archivo", "Instrument Sans", "Schibsted Grotesk",
];

// Which families are serifs — drives the fallback stack (Georgia vs system sans) everywhere fonts render.
export const SERIF_FONTS = new Set([
 "Playfair Display", "Bodoni Moda", "Cormorant Garamond", "Cormorant", "EB Garamond", "Newsreader",
 "Instrument Serif", "Fraunces", "Lora", "Spectral", "Crimson Pro", "Source Serif 4", "Bitter",
 "Literata", "Domine", "PT Serif", "Cardo", "Zilla Slab",
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
// how few colours you use and how precisely they combine. The first eight are the template palettes, so
// a seller who restyles can always get back to the look they started from.
export const STOREFRONT_PALETTES: StorefrontPalette[] = [
 { id: "heirloom", name: "Parchment & Brass", colors: { bg: "#F4EFE6", text: "#1C1917", accent: "#7A5C33" } },
 { id: "provenance", name: "Archive Oxblood", colors: { bg: "#FAF9F7", text: "#14100E", accent: "#6C2126" } },
 { id: "the-index", name: "Paper & Pine", colors: { bg: "#F7F7F5", text: "#17181A", accent: "#2F4739" } },
 { id: "drop", name: "White & Red", colors: { bg: "#FFFFFF", text: "#0A0A0A", accent: "#C40025" } },
 { id: "dear-reader", name: "Peach & Rose", colors: { bg: "#FDF6F0", text: "#2B211D", accent: "#8A3F49" } },
 { id: "sugar", name: "Sugar", colors: { bg: "#FFF0F5", text: "#241019", accent: "#D6006E" } },
 { id: "vitrine", name: "Monochrome", colors: { bg: "#FFFFFF", text: "#111111", accent: "#111111" } },
 { id: "corner-shop", name: "Sage & Pine", colors: { bg: "#F5F2E8", text: "#1F2421", accent: "#2D5F4C" } },
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

/**
 * Every page slug that ANY template ships. This is how the studio tells a template-provided
 * page apart from one the seller wrote themselves, without needing a marker column on the
 * page or a migration for stores that already exist.
 *
 * Switching templates removes the pages in this set and lays down the new template's, so a
 * store that tries three looks ends up with the third one's pages — not all three stacked
 * into the nav. A page whose slug is NOT in here was created by the seller and is never
 * touched.
 */
export const TEMPLATE_PAGE_SLUGS: ReadonlySet<string> = new Set(
 STOREFRONT_TEMPLATES.flatMap((t) => templatePages(t.id).map((p) => p.slug)),
);

/** True when this slug is a template-provided page rather than one the seller authored. */
export function isTemplatePageSlug(slug: string): boolean {
 return TEMPLATE_PAGE_SLUGS.has(slug);
}
