// Every field of a listing the phone can edit, as data.
//
// It lives out here rather than inside the screen so a test can read it, because the thing that
// keeps going wrong is not the editing — it is the LIST. A piece is one record; the web editor and
// /api/store/items/[id] have always carried fourteen fields and the phone carried eight, so
// `description`, `era`, `material`, `colour`, `category` and the parcel numbers could be set on a
// laptop and then neither seen nor corrected at the counter. The seller's report was "not all the
// details that should be there", which is exactly right.
//
// WEB_PATCH_FIELDS below is a copy of what app/api/store/items/[id]/route.ts accepts, and the test
// asserts this file covers it. A copy can go stale — it cannot import across the two packages — so
// it is worth being plain about what it does and does not buy: it catches a field being dropped
// from the phone, not a field being added to the web. Adding one there means adding it here too.

export type FieldKey =
  | "title" | "price" | "cost" | "brand" | "size" | "condition" | "conditionNote" | "flaws"
  | "description" | "era" | "material" | "colour" | "category"
  | "weightOz" | "lengthIn" | "widthIn" | "heightIn";

export type ListingField = {
  key: FieldKey;
  label: string;
  numeric?: boolean;
  multiline?: boolean;
  placeholder?: string;
};

export const FIELDS: ListingField[] = [
  { key: "title", label: "Title" },
  { key: "price", label: "Price", numeric: true },
  // What she paid — the one number the margin report can't do without.
  { key: "cost", label: "Cost", numeric: true, placeholder: "what you paid" },
  { key: "brand", label: "Brand" },
  { key: "era", label: "Era", placeholder: "Late 1990s" },
  { key: "material", label: "Material", placeholder: "Re-Nylon, leather trim" },
  { key: "colour", label: "Colour", placeholder: "Chocolate brown" },
  { key: "size", label: "Size" },
  { key: "category", label: "Category", placeholder: "Bags" },
  { key: "condition", label: "Condition" },
  // Beyond the grade — her words on the wear, the same note Review and the web editor take.
  { key: "conditionNote", label: "Condition note", placeholder: "light wear to the sole, tiny mark inside…" },
  // One comma-separated line, like Review; stored as the list the product page prints.
  { key: "flaws", label: "Flaws", placeholder: "scuffed toe, light pilling — comma-separated" },
  // The paragraph a shopper reads. Last of the words, and multiline so it isn't a one-line box
  // holding two thousand characters.
  { key: "description", label: "Description", multiline: true, placeholder: "How it feels, what it goes with, why you bought it…" },
  // Packed weight and box size decide the parcel tier, and therefore what the label costs. The
  // shipping quote on Orders is built from exactly these.
  { key: "weightOz", label: "Packed weight", numeric: true, placeholder: "oz" },
  { key: "lengthIn", label: "Box length", numeric: true, placeholder: "in" },
  { key: "widthIn", label: "Box width", numeric: true, placeholder: "in" },
  { key: "heightIn", label: "Box height", numeric: true, placeholder: "in" },
];

/** The four the shipping quote reads. Whole units; blank clears one. */
export const PARCEL_KEYS: string[] = ["weightOz", "lengthIn", "widthIn", "heightIn"];

/**
 * What app/api/store/items/[id]/route.ts accepts, minus the things that are not typed into a text
 * box: `images` (the photo strip), `collections` (chips), `measurements` (the category template),
 * and the action-only keys (status, soldOn, until, days, name).
 */
export const WEB_PATCH_FIELDS: string[] = [
  "title", "price", "cost", "brand", "size", "category", "description",
  "era", "material", "colour", "condition", "conditionNote", "flaws",
  "weightOz", "lengthIn", "widthIn", "heightIn",
];

/**
 * How many photos a piece can carry.
 *
 * Not a number the UI gets to invent, and the two write paths do NOT agree: `/api/store/items/[id]`
 * keeps 20, `/api/store/intake/publish` keeps MAX_ITEM_IMAGES, which is 15. The lower of the two
 * wins here, because a cap that lets her pick 20 and then silently stores 15 on the listing flow is
 * worse than one that is honest up front.
 *
 * Six was the old number, invented by the camera screen — it meant the phone, the device she
 * actually shoots on, accepted fewer photos than the web did.
 */
export const MAX_PHOTOS = 15;
