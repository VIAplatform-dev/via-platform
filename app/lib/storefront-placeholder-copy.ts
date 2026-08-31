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
export function placeholderProps(type: string, props: Record<string, string> | undefined, seed = 0): Record<string, string> | undefined {
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
  if (k === "heading") { const h = HEADING[type]; if (h !== undefined) out[k] = h; continue; }
  if (k === "subtext") { const t = SUBTEXT[type]; if (t !== undefined) out[k] = t; continue; }
  if (k === "body") { const b = BODY[type]; out[k] = b !== undefined ? b : BODY.text; continue; }
  if (SIMPLE[k] !== undefined) out[k] = SIMPLE[k];
 }
 return out;
}

/** Apply the placeholder copy to every block in a list. */
export function placeholderBlocks<T extends { type?: string; props?: Record<string, string> }>(blocks: T[]): T[] {
 // Seeded by position so consecutive sections don't all show the same photograph, and so the same
 // template always produces the same page.
 return (blocks || []).map((b, i) => ({ ...b, props: placeholderProps(b.type || "", b.props, i * 3) }));
}
