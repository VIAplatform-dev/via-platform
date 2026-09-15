// Shaping for the seller Inventory screen.
//
// A list, not a table: photo, name, price, and a dot for state. Bulk editing stays at the desk,
// where a table earns its keep.

// "collections" is not a status, it is a different VIEW of the same shop: the other four filter
// the pieces, this one groups them. It rides in the same union because it is the same chip row,
// and filterItems treats it as "all" so nothing downstream has to special-case it.
export type InventoryFilter = "all" | "live" | "drafts" | "sold" | "collections";

/** The dot beside a piece. `null` means no dot. A sold piece is finished, not a state to watch. */
export type ItemDot = "live" | "pending" | null;

const LIVE = new Set(["active"]);
const PENDING = new Set(["draft", "reserved"]);

/**
 * The chips along the top.
 *
 * `removed` never appears under any chip, including All: it is the delete state, and a piece she
 * removed reappearing in her list reads as a failed deletion.
 */
export function filterItems<T extends { status: string }>(items: T[], filter: InventoryFilter): T[] {
  const visible = items.filter((i) => i.status !== "removed");
  if (filter === "all" || filter === "collections") return visible;
  if (filter === "live") return visible.filter((i) => LIVE.has(i.status));
  if (filter === "drafts") return visible.filter((i) => i.status === "draft");
  return visible.filter((i) => i.status === "sold");
}

/**
 * A `reserved` piece, one Market Mode is mid-sale on. Is deliberately NOT live and NOT sold.
 * It carries the same amber dot as a draft: something is unfinished about it.
 */
export function itemDot(status: string): ItemDot {
  if (LIVE.has(status)) return "live";
  if (PENDING.has(status)) return "pending";
  return null;
}

/**
 * The state word beside a reserved piece: "on hold" when a PERSON is holding it (it is in the
 * store's holds list), "reserved" when a buyer is mid-checkout. Null for every other status,
 * the dot already says live/draft, and "sold" has its own chip. Same rule as the web pill.
 */
export function reservedWord(status: string, held: boolean): string | null {
  if (status !== "reserved") return null;
  return held ? "on hold" : "reserved";
}

/**
 * What "reserved" actually means, said out loud.
 *
 * A seller who has just started a Market Mode checkout, or whose shopper is mid-checkout on the
 * website, sees a piece go "reserved" and has no way to know why. It is not a state she set and
 * nothing on the screen explained it, so it reads as the piece being stuck.
 *
 * The mechanism is worth one sentence: a checkout flips the piece active → reserved atomically so
 * two buyers cannot take the same one-of-one, and an abandoned checkout is swept back to active
 * (app/api/cron/release-expired-reservations, every ten minutes against a ten-minute hold). She
 * does not need the cron; she needs to know it comes back on its own.
 */
export const RESERVED_EXPLAINER =
  "Reserved means a checkout is open on it, in Market Mode or on your storefront. It goes back on sale by itself if the checkout is abandoned.";

/** True when anything in the list is mid-checkout, so a screen knows to explain itself. */
export function anyReserved(items: { status: string }[]): boolean {
  return items.some((i) => i.status === "reserved");
}

/**
 * Home's "Needs you" rows deep-link here with ?missing=…; the rules are the web Inventory's
 * (app/infrastructure/admin/inventory/page.tsx `lacks`) so the same pieces answer on both.
 *   photo, no images
 *   price: price is zero or missing
 *   cost, no cost on a LIVE piece (a draft has not been costed yet; a sold one is history)
 *   confidence: the ids /api/store/attention says intake was unsure about
 */
export type MissingFilter = "photo" | "price" | "cost" | "confidence";
export const MISSING_FILTERS: MissingFilter[] = ["photo", "price", "cost", "confidence"];

export function parseMissing(v: unknown): MissingFilter | null {
  return typeof v === "string" && (MISSING_FILTERS as string[]).includes(v) ? (v as MissingFilter) : null;
}

export type MissingItem = { id: string; status: string; images?: string[] | null; priceCents?: number | null; costCents?: number | null };

export function lacks<T extends MissingItem>(items: T[], missing: MissingFilter | null, lowConfidenceIds: Iterable<string> = []): T[] {
  if (!missing) return items;
  const low = new Set(lowConfidenceIds);
  return items.filter((i) => {
    if (missing === "photo") return !(i.images && i.images.length);
    if (missing === "price") return !((i.priceCents ?? 0) > 0);
    if (missing === "cost") return i.costCents == null && i.status === "active";
    return low.has(i.id);
  });
}

/** What the filter is called on the chip row and in the header. */
export function missingLabel(missing: MissingFilter): string {
  return missing === "photo" ? "No photo" : missing === "price" ? "No price" : missing === "cost" ? "No cost" : "AI price to check";
}

/** The line under the title: how much she has, and what has moved. */
export function inventoryCount(total: number, soldThisWeek: number): string {
  if (total === 0) return "Nothing listed yet";
  const pieces = `${total} ${total === 1 ? "piece" : "pieces"}`;
  if (soldThisWeek === 0) return pieces;
  return `${pieces} · ${soldThisWeek} sold this week`;
}
