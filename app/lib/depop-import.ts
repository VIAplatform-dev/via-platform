/**
 * A Depop shop, as the extension read it off the seller's own pages, turned into VYA items. Pure.
 *
 * WHY THIS EXISTS AT ALL. A seller moving to VYA already has her whole shop on Depop: photographs
 * taken, descriptions written, prices decided. Asking her to type it again is asking her not to
 * move. The extension walks her own selling hub in her own browser and collects what is there; this
 * is the shape it arrives in and what it becomes.
 *
 * SOLD PIECES COME TOO, AND AS SOLD. They are not stock — relisting somebody's sold archive would
 * be the worst possible first impression — but they are her history, and history is what the
 * analytics, the price engine and her own sense of what sells are built on. They arrive with their
 * status intact.
 *
 * EVERYTHING ELSE IS A DRAFT. Not active. An import is a copy of another marketplace's listing,
 * written to Depop's character limits and conventions, and the seller decides what goes live here.
 * Landing 400 pieces straight onto her storefront is not a migration, it is an accident.
 */

/** One listing, as content.js collects it from Depop. */
export type DepopImportItem = {
 slug?: unknown;
 title?: unknown;
 description?: unknown;
 images?: unknown;
 priceCents?: unknown;
 currency?: unknown;
 brand?: unknown;
 category?: unknown;
 size?: unknown;
 status?: unknown;
};

/** What goes into the items table. */
export type ReadyItem = {
 sourceId: string;
 title: string;
 description: string | null;
 images: string[];
 priceCents: number;
 currency: string;
 brand: string | null;
 category: string | null;
 size: string | null;
 status: "draft" | "sold";
};

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const orNull = (v: unknown, max: number): string | null => str(v, max) || null;

/**
 * One collected listing, ready to store — or null when there is not enough of it to be an item.
 *
 * A title is the one thing with no sensible default: a piece called "" is unfindable in her own
 * inventory. Everything else may be absent, because Depop lets it be absent.
 */
export function toItem(raw: DepopImportItem, maxImages: number): ReadyItem | null {
 if (!raw || typeof raw !== "object") return null;
 const title = str(raw.title, 200);
 if (!title) return null;
 // The Depop handle. It is how a re-import recognises a piece it has already taken, so without one
 // the piece would arrive again on every run.
 const sourceId = str(raw.slug, 200);
 if (!sourceId) return null;

 const images = Array.isArray(raw.images)
  ? raw.images.filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u)).slice(0, maxImages)
  : [];

 // A NUMBER, NOT SOMETHING NUMBER-ISH. `Number("12.50")` is 12.5, which rounds to 13 — a $12.50
 // piece imported at thirteen cents, sitting in her drafts waiting to be published. A string here
 // would mean the collected shape had changed, and the safe reading of that is "no price yet".
 const cents = typeof raw.priceCents === "number" ? raw.priceCents : NaN;
 return {
  sourceId,
  title,
  description: orNull(raw.description, 8000),
  images,
  // A price that did not survive the read becomes 0 rather than nothing: the piece is a draft, and
  // "needs a price" is a thing her own inventory already knows how to show her.
  priceCents: Number.isFinite(cents) && cents > 0 ? Math.round(cents) : 0,
  currency: (str(raw.currency, 8) || "USD").toUpperCase(),
  brand: orNull(raw.brand, 120),
  category: orNull(raw.category, 120),
  size: orNull(raw.size, 60),
  status: raw.status === "sold" ? "sold" : "draft",
 };
}

/**
 * The whole collection, cleaned and deduplicated.
 *
 * `known` is the set of Depop handles already imported for this store: a seller re-running the
 * import after adding a few listings should get the few, not four hundred duplicates. The extension
 * itself merges its runs by handle, but it cannot know what VYA already has.
 */
export function prepare(raw: unknown, known: Set<string>, maxImages: number): ReadyItem[] {
 if (!Array.isArray(raw)) return [];
 const out: ReadyItem[] = [];
 const seen = new Set(known);
 for (const r of raw) {
  const item = toItem(r as DepopImportItem, maxImages);
  if (!item || seen.has(item.sourceId)) continue;
  seen.add(item.sourceId);
  out.push(item);
 }
 return out;
}

/** "42 pieces, 9 of them already sold" — what the seller is told happened. */
export function importSummary(created: number, sold: number): string {
 if (!created) return "Nothing new to bring over — everything on Depop is already in VYA.";
 const pieces = `${created} ${created === 1 ? "piece" : "pieces"}`;
 if (!sold) return `${pieces} brought over from Depop, saved as drafts.`;
 return `${pieces} brought over from Depop — ${sold} of them already sold, kept as history.`;
}
