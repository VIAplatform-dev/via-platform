// ───────────────────────────────────────────────────────────────────────────
// Placeholder copy for templates.
//
// This replaces the lorem-ipsum pass (see storefront-greek.ts, kept for reference). Lorem made a
// template legible as a LAYOUT and illegible as a store: a seller opening one saw "Excepteur sint
// occaecat cupidatat" where their headline goes and had to decode what the section was even for.
//
// So every content field now gets plain English that says what belongs there. Two rules:
//
//   1. It is keyed by BLOCK TYPE and FIELD, never by template. Every template therefore shows the
//      identical words in the identical slots — templates differ by layout and palette, which is the
//      thing a seller is actually choosing between. Copy differences would be noise.
//   2. It reads as real sentences, not instructions in brackets. A seller should be able to publish
//      the template untouched and have it make sense, then replace the words at their own pace.
//
// The authored guidance copy stays in storefront-templates.ts, unchanged — it still documents what
// each block is for, and swapping this pass out is one call site.
// ───────────────────────────────────────────────────────────────────────────
import { placeholderImage } from "./storefront-placeholder-image.ts";

/** Headline per section type. The one field where the section's purpose really has to come through. */
const HEADING: Record<string, string> = {
 hero: "Welcome to our store",
 featured: "Our products",
 collections: "Shop by category",
 testimonials: "What our customers say",
 blog: "From the journal",
 faq: "Frequently asked questions",
 columns: "Why shop with us",
 // A generic heading, used only when the PAGE doesn't tell us better — see PAGE_COPY. On a
 // Shipping or Condition Scale page, "About us" is simply wrong, and it was appearing there
 // because copy was keyed by block type alone.
 text: "About us",
 split: "Our story",
 spotlight: "This week's piece",
 newsletter: "Join our list",
 contact: "Get in touch",
 countdown: "Coming soon",
 gallery: "Our latest",
 image: "",
 statement: "",
};

/** Supporting line under a headline. */
const SUBTEXT: Record<string, string> = {
 hero: "Everything we make, in one place.",
 featured: "A few things we think you'll like.",
 collections: "Find what you're looking for.",
 testimonials: "",
 blog: "Notes, stories and things we're into.",
 faq: "Everything you might want to know.",
 newsletter: "Be the first to hear about new arrivals.",
 contact: "We usually reply within a day.",
 countdown: "Something new is on its way.",
 spotlight: "A closer look at one of our favourites.",
 split: "",
};

/** Longer body copy. */
const BODY: Record<string, string> = {
 text: "Tell people who you are and what you sell. A short paragraph is plenty — what you make, where it comes from, and why it matters to you.",
 split: "Tell people who you are and what you sell. A short paragraph is plenty — what you make, where it comes from, and why it matters to you.",
 columns: "",
};

// Repeated content, written out in the pipe-delimited shape each list is stored in (see
// storefront-items.ts). Images are left empty so the placeholder-image pass can fill them.
const ITEMS: Record<string, string> = {
 collections: "New in\nBest sellers\nClothing\nAccessories\nSale\nGifts",
 testimonials: "Exactly what I was hoping for. I'll definitely order again. | Alex M.\nLovely quality and it arrived quickly. | Sam R.\nEasy to order and beautifully packaged. | Jo T.",
 blog: "How we got started | The short story of why we opened. | | \nHow to care for your pieces | A few simple things that make them last. | | \nWhat's new this season | The pieces we're most excited about. | | ",
 columns: "Made with care | Every piece is chosen by hand. | | | \nOne of a kind | When it's gone, it's gone. | | | \nFast delivery | Packed and posted within a day. | | | ",
 marquee: "Free shipping\nEasy returns\nMade with care\nNew arrivals weekly",
};

/** Everything else — one value per field, the same wherever that field appears. */
const SIMPLE: Record<string, string> = {
 quote: "We started this shop to sell things we'd want to own ourselves.",
 attribution: "A happy customer",
 caption: "Add a caption for this photo.",
 text: "Free shipping on all orders",
 lede: "A short introduction goes here.",
 price: "$48",
};

/** The FAQ rows, stored as q0/a0, q1/a1… rather than as a list. */
const FAQ: string[][] = [
 ["How long does delivery take?", "Most orders arrive within three to five working days."],
 ["Can I return something?", "Yes — anything unworn can come back to us within 30 days."],
 ["How do I get in touch?", "Send us a message and we'll reply within a day."],
 ["Do you ship internationally?", "We do. Shipping is calculated at checkout."],
];

// Image fields, by the key each block stores them under. A template that authored an image gets the
// placeholder; one that deliberately left a slot empty stays empty.
const IMAGE_KEYS = new Set(["image", "img", "logo", "poster"]);

// Where the image sits in each list's pipe-delimited row (see ITEM_SCHEMAS). A tile is
// "label | img | pos | href", a post is "title | excerpt | img | link", a column adds a button after.
const ITEM_IMAGE_COL: Record<string, number> = { collections: 1, blog: 2, columns: 2 };

/** Fill the image column of every row in a repeated list, leaving the rest of the row alone. */
function withItemImages(type: string, rows: string, seed: number): string {
 const col = ITEM_IMAGE_COL[type];
 if (col === undefined) return rows;
 return rows
  .split("\n")
  .map((row, i) => {
   if (!row.trim()) return row;
   const cells = row.split("|").map((c) => c.trim());
   while (cells.length <= col) cells.push("");
   cells[col] = placeholderImage(seed + i);
   return cells.join(" | ");
  })
  .join("\n");
}

const SLIDES = [
 `Welcome to our store | Everything we make, in one place. | Shop now | ${placeholderImage(0)}`,
 `New arrivals | The pieces we just added. | Shop now | ${placeholderImage(1)}`,
].join("\n");

const CONTENT_KEYS = new Set(["heading", "subtext", "body", "quote", "caption", "attribution", "text", "items", "images", "lede", "price", "slides"]);
const qaMatch = (k: string) => /^([qa])(\d+)$/.exec(k);

/**
 * Replace one block's content with the placeholder set for its type.
 *
 * A field only changes if the template actually authored something there — an empty field stays
 * empty, so a layout that deliberately omits a subtext doesn't suddenly grow one.
 */
/**
 * What a generic block should say, given the page it's on.
 *
 * Copy was keyed by BLOCK TYPE alone, which is right for a home page and wrong everywhere else: a
 * text block on Shipping was headed "About us", and so was one on Condition Scale. A template page
 * exists to say something specific, and its placeholder should say the same specific thing.
 *
 * Matched on the page slug, so a template can add a page and get sensible words without touching
 * this file — anything unmatched falls back to the generic heading, which is the old behaviour.
 */
const PAGE_COPY: { match: RegExp; heading: Record<string, string>; body?: Record<string, string> }[] = [
 {
  match: /^(about|our-story|story|philosophy)$/,
  heading: { text: "About us", split: "Our story" },
 },
 {
  match: /^(shipping|delivery|returns|shipping-returns)$/,
  heading: { text: "Shipping & returns", split: "How we post", faq: "Shipping questions" },
  body: { text: "How long orders take, what postage costs, and what happens if something needs to come back." },
 },
 {
  match: /^(authenticity|authentication|verified)$/,
  heading: { text: "How we check", split: "How we check", columns: "What we look at" },
  body: { text: "What you do before a piece is listed, and what you say when you can't be certain." },
 },
 {
  match: /^(condition|condition-scale|grading)$/,
  heading: { text: "How we grade condition", split: "How we grade condition", faq: "What each grade means" },
  body: { text: "The words you use on every listing, and what each one means. Buyers rely on these being consistent." },
 },
 {
  match: /^(sizing|fit|measurements)$/,
  heading: { text: "How we measure", split: "How we measure" },
  body: { text: "How you take measurements and how a buyer should compare them to something they own." },
 },
 {
  match: /^(consign|sell-to-us|sell|sourcing-requests)$/,
  heading: { text: "Sell with us", split: "Sell with us", columns: "How it works" },
  body: { text: "What you take, how you price it, and what a seller can expect to be paid." },
 },
 {
  match: /^(visit|store|location|events)$/,
  heading: { text: "Come and see us", split: "Where to find us" },
  body: { text: "Where you are, when you're open, and what someone should expect when they visit." },
 },
 {
  match: /^(faq|questions|help)$/,
  heading: { text: "Questions", faq: "Frequently asked questions" },
 },
 {
  match: /^(contact|get-in-touch)$/,
  heading: { text: "Get in touch", contact: "Get in touch" },
  body: { text: "How to reach you, and how long you usually take to reply." },
 },
 {
  match: /^(journal|blog|notes|the-edits|drop-archive|how-drops-work)$/,
  heading: { text: "From the journal", split: "From the journal" },
  body: { text: "A short note about what you write here and how often." },
 },
];

function pageOverride(page: string | undefined, type: string, field: "heading" | "body"): string | undefined {
 const slug = String(page || "").toLowerCase().trim();
 if (!slug) return undefined;
 const hit = PAGE_COPY.find((p) => p.match.test(slug));
 return hit?.[field]?.[type];
}

export function placeholderProps(type: string, props: Record<string, string> | undefined, seed = 0, page?: string): Record<string, string> | undefined {
 if (!props) return props;
 const out = { ...props };
 for (const k of Object.keys(out)) {
  const v = out[k];
  if (typeof v !== "string") continue;

  // Image slots are filled whether or not the template authored one — and templates author them
  // EMPTY, on the assumption the seller brings photos. That assumption is what makes a fresh
  // template unreadable: an empty hero looks like a hero that isn't MEANT to have a picture, so a
  // seller can't tell a missing photo from a deliberate design. Every slot the layout defines gets a
  // placeholder, because that is the only way the slot announces itself.
  if (IMAGE_KEYS.has(k)) { out[k] = placeholderImage(seed); continue; }
  // A gallery's list is LOOSE — comma OR newline separates entries (see ITEM_SCHEMAS) — and every
  // data URI carries a comma after its media type. Written raw, one placeholder shatters into two
  // broken half-entries; the codec's escape for that is a backslash.
  if (k === "images") {
   const n = Math.max(6, v.split("\n").filter((x) => x.trim()).length);
   out[k] = Array.from({ length: n }, (_, i) => placeholderImage(seed + i)).join("\n");
   continue;
  }
  if (k === "slides") { out[k] = SLIDES; continue; }

  // Everything below is COPY, and copy is only replaced where the template wrote some: a layout that
  // deliberately omits a subtext shouldn't suddenly grow one.
  if (!v.trim()) continue;

  const qa = qaMatch(k);
  if (qa) {
   const row = FAQ[Number(qa[2]) % FAQ.length];
   out[k] = qa[1] === "q" ? row[0] : row[1];
   continue;
  }
  if (!CONTENT_KEYS.has(k)) continue;

  if (k === "items") { out[k] = withItemImages(type, ITEMS[type] ?? v, seed); continue; }
  if (k === "heading") {
   const h = pageOverride(page, type, "heading") ?? HEADING[type];
   if (h !== undefined) out[k] = h;
   continue;
  }
  if (k === "subtext") { const t = SUBTEXT[type]; if (t !== undefined) out[k] = t; continue; }
  if (k === "body") {
   const b = pageOverride(page, type, "body") ?? BODY[type];
   out[k] = b !== undefined ? b : BODY.text;
   continue;
  }
  if (SIMPLE[k] !== undefined) out[k] = SIMPLE[k];
 }
 return out;
}

/** Apply the placeholder copy to every block in a list. */
export function placeholderBlocks<T extends { type?: string; props?: Record<string, string> }>(blocks: T[], page?: string): T[] {
 // Seeded by position so consecutive sections don't all show the same photograph, and so the same
 // template always produces the same page.
 return (blocks || []).map((b, i) => ({ ...b, props: placeholderProps(b.type || "", b.props, i * 3, page) }));
}
