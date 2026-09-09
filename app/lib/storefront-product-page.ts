// ───────────────────────────────────────────────────────────────────────────
// What a product page SAYS, and in what order.
//
// The arrangement (photo left, photo rail, full width) is `theme.productLayout`. This is the other
// half: which facts about a piece are printed, whether each one sits inline or folds into a drawer,
// what it's called, and the two sentences VYA used to put in every seller's mouth.
//
// Most of these fields were already on every listing and shown to nobody: brand, era, material,
// condition and origin were fed to the meta description and the schema.org block — so Google was
// told the era of a piece and the shopper looking at it wasn't.
//
// Pure and dependency-free: the settings panel, the live page and the editor preview all read one
// definition, so what a seller arranges is what a shopper gets.
// ───────────────────────────────────────────────────────────────────────────

/** The facts a listing carries. Loosely typed on purpose — the DB row, the editor's sample product
 *  and a test fixture all satisfy it without this module knowing about Drizzle. */
export type ProductFacts = {
 brand?: string | null;
 era?: string | null;
 material?: string | null;
 condition?: string | null;
 origin?: string | null;
 size?: string | null;
 description?: string | null;
 measurements?: string | null;
};

export type ProductFieldKey = keyof ProductFacts;
/**
 * inline = printed in the column.
 * drawer = folded into a <details> the shopper opens.
 * chip   = the value as a pill, the way a size is shown on most fashion sites. Only worth it for
 *          SHORT values — a paragraph in a pill is a paragraph with a border round it.
 */
export type FieldMode = "inline" | "drawer" | "chip";

/** Fields whose values are prose. A chip is refused for these rather than silently ignored. */
export const LONG_FIELDS: ProductFieldKey[] = ["description", "measurements"];
export const canChip = (key: ProductFieldKey): boolean => !LONG_FIELDS.includes(key);

export type ProductField = { key: ProductFieldKey; show: boolean; mode: FieldMode; label?: string };

/**
 * How the buy / rent buttons look.
 *
 * Every CTA a product page renders — Buy now, Rent now, Buy outright, the appointment button —
 * already carries `vya-cta`, so one rule reaches all of them. Colours default to null meaning
 * "the storefront accent", so a store that never opens this looks exactly as it does today.
 */
export type ButtonStyle = {
 fill: "solid" | "outline";
 bg: string | null;
 text: string | null;
 uppercase: boolean;
 /** Letter-spacing in hundredths of an em — 20 = 0.2em, the wide tracking these buttons ship with. */
 tracking: number;
 /**
  * Corner radius in px. `null` follows the store's corner style, which is the right default — a
  * shop that chose round corners wants round buttons. It's here as its own control because the
  * reverse is a real want too: pill buttons on a page whose photographs stay square.
  */
 radius: number | null;
};

export const DEFAULT_BUTTONS: ButtonStyle = { fill: "solid", bg: null, text: null, uppercase: true, tracking: 20, radius: null };

/** Offered in the panel. 999 is a pill at any height; a value between is a soft corner. */
export const BUTTON_RADII: { value: number | null; label: string }[] = [
 { value: null, label: "Follow store" },
 { value: 0, label: "Square" },
 { value: 8, label: "Soft" },
 { value: 999, label: "Round" },
];

/**
 * The order of the details column.
 *
 * A product page is a TEMPLATE — it renders against every listing a store will ever have — so this
 * is a list of slots, not a canvas. Dragging parts to arbitrary positions would be authored against
 * one piece and break on the next: twelve photos or one, no measurements, a rental with no sale
 * price. An ordered list survives all of them, and still lets a store put its price under the
 * button, lead with the buy box, or slip its own note between the two.
 *
 * `buy` is the one slot that can't be hidden. A product page without a way to buy is not a design
 * choice a seller means to make, and it's the one mistake here that costs them money silently.
 */
export type SlotKind = "title" | "price" | "details" | "buy" | "assurance" | "text" | "link" | "divider";

export const BUILTIN_SLOTS: SlotKind[] = ["title", "price", "details", "buy", "assurance"];
export const isBuiltinSlot = (k: SlotKind): boolean => BUILTIN_SLOTS.includes(k);
/** The slot a shopper needs in order to become a customer. */
export const REQUIRED_SLOT: SlotKind = "buy";

export type ProductSlot = {
 id: string;
 kind: SlotKind;
 show: boolean;
 /** text / link only. */
 text?: string;
 /** link only. */
 href?: string;
};

export const SLOT_CATALOGUE: { kind: SlotKind; name: string; hint: string }[] = [
 { kind: "title", name: "Title", hint: "The piece's name." },
 { kind: "price", name: "Price", hint: "And the was-price, if you show one." },
 { kind: "details", name: "Details", hint: "The fields you arranged above." },
 { kind: "buy", name: "Buy / Rent", hint: "The buttons. Always shown." },
 { kind: "assurance", name: "Your closing line", hint: "The sentence under the buttons." },
];

/** The blocks a store can add of its own — a sizing note, a link to a guide, a rule. */
export const ADDABLE_SLOTS: { kind: SlotKind; name: string }[] = [
 { kind: "text", name: "A line of text" },
 { kind: "link", name: "A link" },
 { kind: "divider", name: "A divider" },
];

export type ProductPageConfig = {
 fields: ProductField[];
 slots: ProductSlot[];
 buttons: ButtonStyle;
 /** Print the was-price struck through, with a Sale mark, when the listing has one. */
 comparePrice: boolean;
 /** The link back to the shop. "" hides it. */
 backLabel: string;
 /** The reassurance line under the button. "" hides it. */
 assurance: string;
};

/** Our words, until a store writes its own. Kept here so the page never hardcodes a sentence. */
export const DEFAULT_BACK_LABEL = "← Back to shop";
export const DEFAULT_ASSURANCE = "One-of-one vintage — once it’s gone, it’s gone. Secure checkout by Stripe.";

/** Every field, with the name a seller sees and the heading printed on the page. */
export const FIELD_CATALOGUE: { key: ProductFieldKey; name: string; label: string; hint: string }[] = [
 { key: "description", name: "Description", label: "Description", hint: "What you wrote about the piece." },
 { key: "size", name: "Size", label: "Size", hint: "Printed as you entered it." },
 { key: "measurements", name: "Measurements", label: "Measurements", hint: "Chest, length, waist — however you took them." },
 { key: "condition", name: "Condition", label: "Condition", hint: "Already on every listing. Off by default." },
 { key: "brand", name: "Brand", label: "Brand", hint: "Already on every listing. Off by default." },
 { key: "era", name: "Era", label: "Era", hint: "Already on every listing. Off by default." },
 { key: "material", name: "Material", label: "Material", hint: "Already on every listing. Off by default." },
 { key: "origin", name: "Origin", label: "Made in", hint: "Already on every listing. Off by default." },
];

const CATALOGUE_KEYS = FIELD_CATALOGUE.map((f) => f.key);
const isKey = (v: unknown): v is ProductFieldKey => CATALOGUE_KEYS.includes(v as ProductFieldKey);

/**
 * What a store gets if it touches nothing: EXACTLY the page it has today — size, description and
 * measurements, inline, in that order. A seller who never opens this panel must not find their live
 * product pages rearranged, so every newly-surfaced field starts off.
 */
export const DEFAULT_PRODUCT_PAGE: ProductPageConfig = {
 fields: [
  { key: "size", show: true, mode: "inline" },
  { key: "description", show: true, mode: "inline" },
  { key: "measurements", show: true, mode: "inline" },
  { key: "condition", show: false, mode: "inline" },
  { key: "brand", show: false, mode: "inline" },
  { key: "era", show: false, mode: "inline" },
  { key: "material", show: false, mode: "inline" },
  { key: "origin", show: false, mode: "inline" },
 ],
 // Today's order, so a store that never opens this keeps the page it has.
 slots: BUILTIN_SLOTS.map((kind) => ({ id: kind, kind, show: true })),
 buttons: DEFAULT_BUTTONS,
 comparePrice: false,
 backLabel: DEFAULT_BACK_LABEL,
 assurance: DEFAULT_ASSURANCE,
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v: unknown): string | null => (typeof v === "string" && HEX.test(v.trim()) ? v.trim() : null);

const SLOT_KINDS = new Set<SlotKind>([...BUILTIN_SLOTS, "text", "link", "divider"]);
/** Keep the id a seller's row already had, so reordering doesn't remount every block. */
const slotId = (id: unknown, at: number): string =>
 typeof id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : `s${at}${Math.random().toString(36).slice(2, 7)}`;

const str = (v: unknown, fallback: string, max: number): string =>
 typeof v === "string" ? v.trim().slice(0, max) : fallback;

/**
 * Fold a stored blob onto the defaults.
 *
 * Order is the array's order, so this preserves what the seller arranged. Anything the blob doesn't
 * mention is appended in catalogue order at its default — which is what lets a NEW field ship
 * without every store's saved config having to be migrated.
 */
export function resolveProductPage(stored?: Partial<ProductPageConfig> | null): ProductPageConfig {
 const s = stored || {};
 const seen = new Set<ProductFieldKey>();
 const fields: ProductField[] = [];
 if (Array.isArray(s.fields)) {
  for (const raw of s.fields) {
   const key = (raw as ProductField)?.key;
   if (!isKey(key) || seen.has(key)) continue; // unknown or duplicated → dropped, never thrown
   seen.add(key);
   const f = raw as ProductField;
   const label = typeof f.label === "string" ? f.label.trim().slice(0, 40) : "";
   fields.push({
    key,
    show: f.show !== false,
    mode: f.mode === "drawer" ? "drawer" : f.mode === "chip" && canChip(key) ? "chip" : "inline",
    ...(label ? { label } : {}),
   });
  }
 }
 for (const d of DEFAULT_PRODUCT_PAGE.fields) if (!seen.has(d.key)) fields.push({ ...d });

 // Slots: the seller's order is the array's order. A built-in they haven't seen is appended, so a
 // config saved before a slot existed still gets it rather than losing the part of the page it draws.
 const slots: ProductSlot[] = [];
 const seenBuiltin = new Set<SlotKind>();
 let customs = 0;
 for (const raw of Array.isArray(s.slots) ? s.slots : []) {
  const r = (raw || {}) as ProductSlot;
  const kind = r.kind;
  if (!kind || !SLOT_KINDS.has(kind)) continue;
  if (isBuiltinSlot(kind)) {
   if (seenBuiltin.has(kind)) continue;
   seenBuiltin.add(kind);
   slots.push({ id: kind, kind, show: kind === REQUIRED_SLOT ? true : r.show !== false });
  } else {
   if (++customs > 12) continue; // a details column is a column, not a page
   if (kind === "divider") { slots.push({ id: slotId(r.id, slots.length), kind, show: r.show !== false }); continue; }
   const text = typeof r.text === "string" ? r.text.trim().slice(0, 300) : "";
   if (!text) continue; // an empty note is not a note
   const href = typeof r.href === "string" && /^(https?:\/\/|\/|mailto:)/i.test(r.href.trim()) ? r.href.trim().slice(0, 500) : "";
   if (kind === "link" && !href) continue;
   slots.push({ id: slotId(r.id, slots.length), kind, show: r.show !== false, text, ...(href ? { href } : {}) });
  }
 }
 for (const kind of BUILTIN_SLOTS) if (!seenBuiltin.has(kind)) slots.push({ id: kind, kind, show: true });

 const b = (s.buttons || {}) as Partial<ButtonStyle>;
 return {
  fields,
  slots,
  buttons: {
   fill: b.fill === "outline" ? "outline" : "solid",
   bg: hex(b.bg),
   text: hex(b.text),
   uppercase: typeof b.uppercase === "boolean" ? b.uppercase : DEFAULT_BUTTONS.uppercase,
   tracking: Number.isFinite(Number(b.tracking)) ? Math.min(Math.max(Math.round(Number(b.tracking)), 0), 60) : DEFAULT_BUTTONS.tracking,
   radius: b.radius === null || b.radius === undefined || !Number.isFinite(Number(b.radius))
    ? null : Math.min(Math.max(Math.round(Number(b.radius)), 0), 999),
  },
  comparePrice: typeof s.comparePrice === "boolean" ? s.comparePrice : DEFAULT_PRODUCT_PAGE.comparePrice,
  // "" is a real answer here — it means "don't print that sentence" — so an empty string is kept
  // rather than falling back to ours. Only a missing/non-string value takes the default.
  backLabel: str(s.backLabel, DEFAULT_BACK_LABEL, 40),
  assurance: str(s.assurance, DEFAULT_ASSURANCE, 300),
 };
}

export type ResolvedField = { key: ProductFieldKey; label: string; value: string; mode: FieldMode };

/**
 * The fields to actually print for one piece, in the seller's order.
 *
 * A field with nothing in it is dropped here rather than by the renderer, so a listing with no
 * measurements leaves no empty heading behind and every layout gets that for free.
 */
export function visibleFields(config: ProductPageConfig, facts: ProductFacts): ResolvedField[] {
 const out: ResolvedField[] = [];
 for (const f of config.fields) {
  if (!f.show) continue;
  const value = String(facts[f.key] ?? "").trim();
  if (!value) continue;
  const cat = FIELD_CATALOGUE.find((c) => c.key === f.key);
  out.push({ key: f.key, label: f.label || cat?.label || f.key, value, mode: f.mode });
 }
 return out;
}

/** Move a field within the order. Out-of-range indices are a no-op, not a crash. */
export function reorderFields(fields: ProductField[], from: number, to: number): ProductField[] {
 if (from === to || from < 0 || to < 0 || from >= fields.length || to >= fields.length) return fields;
 const next = fields.slice();
 const [moved] = next.splice(from, 1);
 next.splice(to, 0, moved);
 return next;
}

/**
 * The button rules, scoped to the product page (`.vya-pp`).
 *
 * Scoped and `!important` on purpose. Every CTA sets its colour inline — an inline style beats any
 * class — so a class alone would do nothing; and confining it to the product page means it can't
 * fight the per-section button controls a seller already has on their home page. Returns "" when
 * the store has changed nothing, so the default page ships no extra CSS at all.
 */
export function buttonCss(buttons: ButtonStyle, accent: string): string {
 const d = DEFAULT_BUTTONS;
 const unchanged = buttons.fill === d.fill && !buttons.bg && !buttons.text
  && buttons.uppercase === d.uppercase && buttons.tracking === d.tracking && buttons.radius === null;
 if (unchanged) return "";
 const bg = buttons.bg || accent;
 const fg = buttons.text || "#ffffff";
 const box = buttons.fill === "outline"
  ? `background:transparent!important;color:${bg}!important;border:1px solid ${bg}!important;`
  : `background:${bg}!important;color:${fg}!important;border:1px solid ${bg}!important;`;
 // Omitted when it's null, so the store's own corner style keeps governing — the radiusCss rule
 // already sets `.vya-cta`, and a second rule repeating it would only be a thing to drift.
 const corner = buttons.radius === null ? "" : `border-radius:${buttons.radius}px!important;`;
 return `.vya-pp .vya-cta{${box}${corner}text-transform:${buttons.uppercase ? "uppercase" : "none"}!important;`
  + `letter-spacing:${(buttons.tracking / 100).toFixed(2)}em!important}`;
}
