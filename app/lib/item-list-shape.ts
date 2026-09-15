/**
 * The shape a LIST of pieces travels in, as opposed to the shape one open piece travels in.
 *
 * WHY THIS EXISTS. /api/store/items returned every column of every row. The `items` table has 44 of
 * them, and for the largest store on the platform (2nd Street, 5,297 pieces) that is 12.5 MB of
 * JSON, downloaded and parsed on a phone, to draw a list of photographs and prices. Measured, per
 * column:
 *
 *     3,669 KB  description        never drawn in a list
 *     2,889 KB  images             only the first one is ever drawn
 *       530 KB  variants           never drawn
 *       269 KB  source_url         never drawn
 *       116 KB  measurements       never drawn in a list
 *
 * Projecting to what the list actually reads takes the same store to 1.8 MB.
 *
 * THE FIRST PHOTOGRAPH ONLY. Both list screens draw `images[0]` and nothing else. A row thumbnail
 * or a grid tile. The rest of the photographs belong to the piece, and arrive when she opens it.
 * Sending one preserves the only other thing the list asks of this field, which is whether there is
 * a photograph AT ALL ("No photo" in Needs you): none stays none, some stays some.
 *
 * COST STAYS, AND IT IS THE EXCEPTION. Cost is hers and not a shopper's business, and it does not
 * travel anywhere a customer can reach, but the list itself reads it, for the "No cost" filter
 * that finds live pieces she priced before she knew what she paid. A flag would do, at the cost of
 * a second way to ask the same question. The sourcing fields around it, where it came from, when,
 * which lot: are not read here and do not come.
 *
 * NOT THE DEFAULT. Every caller that asks for no particular view still gets the whole row, because
 * the desktop Inventory edits in place and reads most of them. This is opt-in, via ?view=list.
 */

/** One piece, as a list draws it. */
export type ListItem = {
 id: string;
 title: string;
 priceCents: number;
 costCents: number | null;
 currency: string;
 /** The first photograph, or an empty array when there is none. Never the whole roll. */
 images: string[];
 category: string | null;
 status: string;
 soldAt: string | null;
 createdAt: string | null;
};

/** What a row of `items` looks like coming out of the database, for the fields this reads. */
type ItemRow = {
 id: string;
 title: string | null;
 priceCents: number | null;
 costCents: number | null;
 currency: string | null;
 images: unknown;
 category: string | null;
 status: string;
 soldAt: Date | string | null;
 createdAt: Date | string | null;
};

const iso = (v: Date | string | null | undefined): string | null => {
 if (!v) return null;
 const d = v instanceof Date ? v : new Date(v);
 return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** The first photograph as a one-element array, or none. */
function firstImage(images: unknown): string[] {
 if (!Array.isArray(images)) return [];
 const first = images.find((v) => typeof v === "string" && v.trim());
 return first ? [String(first)] : [];
}

/** One row, projected to what a list draws. */
export function toListItem(item: ItemRow): ListItem {
 return {
  id: item.id,
  title: item.title ?? "",
  priceCents: Number(item.priceCents) || 0,
  costCents: item.costCents == null ? null : Number(item.costCents),
  currency: item.currency || "USD",
  images: firstImage(item.images),
  category: item.category ?? null,
  status: item.status,
  soldAt: iso(item.soldAt),
  createdAt: iso(item.createdAt),
 };
}
