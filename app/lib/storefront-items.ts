// Repeated section content (review lists, category tiles, blog posts, columns, hero slides…) — the
// typed seam in front of how it's actually STORED.
//
// A block's props are `Record<string, string>`, so a list has to be flattened into one string:
// fields joined by " | ", items separated by newlines. That encoding is what every other part of the
// platform already speaks — VYA's assistant tools describe it to Claude in prose, site-capture and
// store-import write it, sanitizeBlocks copies it through, and every saved storefront holds it.
//
// So the encoding stays. This module is the ONLY thing that reads or writes it: editors and renderers
// work with real objects and never touch a delimiter. Two upshots — merchants get add/reorder/delete
// instead of a pipe-delimited textarea, and if we ever want real arrays in props, it's these two
// functions plus a migration, not a rewrite of every section.

// One repeated-content shape: which props key holds the blob, and what the fields are in pipe order.
// `loose` splits on commas as well as newlines (marquee/gallery accept either — sellers paste both).
export type ItemSchema = { key: string; fields: readonly string[]; loose?: boolean };
export type Item = Record<string, string>;

export const ITEM_SCHEMAS = {
 collections: { key: "items", fields: ["label", "img", "pos", "href"] },
 testimonials: { key: "items", fields: ["quote", "name"] },
 blog: { key: "items", fields: ["title", "excerpt", "img", "link"] },
 columns: { key: "items", fields: ["heading", "body", "img", "btn", "href"] },
 marquee: { key: "items", fields: ["label"], loose: true },
 gallery: { key: "images", fields: ["src", "pos"], loose: true },
 // Hero slideshow — each slide is a full hero's worth of content (see the `slides` hero variant).
 slides: { key: "slides", fields: ["heading", "subtext", "cta", "image"] },
} as const satisfies Record<string, ItemSchema>;

export type ItemSchemaName = keyof typeof ITEM_SCHEMAS;

// ── encoding ────────────────────────────────────────────────────────────────────────────────────
// A value may legitimately contain a "|" (a review that says "in | out") or a line break (a column's
// body copy) — either one would split a row in the wrong place. Escape both on write.
//
// In a `loose` schema a comma is ALSO a row delimiter, so a comma inside a value splits it too —
// and image URLs carry them routinely (a Cloudinary transform like `w_800,h_600,c_fill` turned one
// gallery photo into three broken entries). Commas are escaped for loose schemas only: in a strict
// schema a comma isn't a delimiter, and writing "\," there would put a backslash in front of every
// comma in a merchant's body copy for no reason.
//
// Reading is deliberately lenient so it round-trips data written before this module existed: a lone
// backslash that isn't one of the escapes below is kept verbatim rather than swallowed. Unescaping
// accepts "\," from any schema — splitUnescaped already refuses to break on it either way.
function esc(v: string, loose?: boolean): string {
 const base = v.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, "\\n");
 return loose ? base.replace(/,/g, "\\,") : base;
}
function unesc(v: string): string {
 return v.replace(/\\([\\|n,])/g, (_, c) => (c === "n" ? "\n" : c));
}
// Split on a delimiter, ignoring occurrences escaped with a backslash.
function splitUnescaped(s: string, delims: string): string[] {
 const out: string[] = [];
 let cur = "";
 for (let i = 0; i < s.length; i++) {
  const c = s[i];
  if (c === "\\" && i + 1 < s.length) { cur += c + s[i + 1]; i++; continue; }
  if (delims.includes(c)) { out.push(cur); cur = ""; continue; }
  cur += c;
 }
 out.push(cur);
 return out;
}

// Read a section's repeated content as real objects. Missing/blank → []. Extra pipe-separated values
// beyond the schema's fields are dropped; missing ones read as "".
export function readItems(props: Record<string, string> | undefined, schema: ItemSchema): Item[] {
 const raw = props?.[schema.key] || "";
 if (!raw.trim()) return [];
 const rows = splitUnescaped(raw, schema.loose ? "\n," : "\n");
 const out: Item[] = [];
 for (const row of rows) {
  if (!row.trim()) continue;
  const parts = splitUnescaped(row, "|").map((s) => unesc(s).trim());
  const item: Item = {};
  schema.fields.forEach((f, i) => { item[f] = parts[i] ?? ""; });
  // A row of nothing but separators ("  |  | ") carries no content — drop it rather than render a ghost card.
  if (schema.fields.some((f) => item[f])) out.push(item);
 }
 return out;
}

// Serialize items back to the stored blob. Trailing empty fields are trimmed so a tiles list with no
// images stays "Dresses\nOuterwear", not "Dresses | \nOuterwear | " — same shape a seller would type.
export function writeItems(items: Item[], schema: ItemSchema): string {
 return items
  .map((it) => {
   const parts = schema.fields.map((f) => esc(String(it[f] ?? ""), schema.loose));
   while (parts.length > 1 && !parts[parts.length - 1]) parts.pop();
   return parts.join(" | ");
  })
  .filter((line) => line.trim())
  .join("\n");
}

// ── list operations (what the editor's add/delete/reorder/duplicate buttons call) ────────────────
export function addItem(items: Item[], schema: ItemSchema, seed?: Item): Item[] {
 const blank: Item = {};
 schema.fields.forEach((f) => { blank[f] = ""; });
 return [...items, { ...blank, ...(seed || {}) }];
}
export function removeItem(items: Item[], index: number): Item[] {
 return items.filter((_, i) => i !== index);
}
export function duplicateItem(items: Item[], index: number): Item[] {
 const it = items[index];
 if (!it) return items;
 return [...items.slice(0, index + 1), { ...it }, ...items.slice(index + 1)];
}
// Move an item to a new index, clamped. Used by drag-to-reorder and the up/down nudge buttons.
export function moveItem(items: Item[], from: number, to: number): Item[] {
 if (from === to || from < 0 || from >= items.length) return items;
 const next = [...items];
 const [it] = next.splice(from, 1);
 next.splice(Math.max(0, Math.min(next.length, to)), 0, it);
 return next;
}
export function patchItem(items: Item[], index: number, patch: Item): Item[] {
 return items.map((it, i) => (i === index ? { ...it, ...patch } : it));
}
