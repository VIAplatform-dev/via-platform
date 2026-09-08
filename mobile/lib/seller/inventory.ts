// Shaping for the seller Inventory screen.
//
// A list, not a table: photo, name, price, and a dot for state. Bulk editing stays at the desk,
// where a table earns its keep.

export type InventoryFilter = "all" | "live" | "drafts" | "sold";

/** The dot beside a piece. `null` means no dot — a sold piece is finished, not a state to watch. */
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
  if (filter === "all") return visible;
  if (filter === "live") return visible.filter((i) => LIVE.has(i.status));
  if (filter === "drafts") return visible.filter((i) => i.status === "draft");
  return visible.filter((i) => i.status === "sold");
}

/**
 * A `reserved` piece — one Market Mode is mid-sale on — is deliberately NOT live and NOT sold.
 * It carries the same amber dot as a draft: something is unfinished about it.
 */
export function itemDot(status: string): ItemDot {
  if (LIVE.has(status)) return "live";
  if (PENDING.has(status)) return "pending";
  return null;
}

/**
 * The state word beside a reserved piece: "on hold" when a PERSON is holding it (it is in the
 * store's holds list), "reserved" when a buyer is mid-checkout. Null for every other status —
 * the dot already says live/draft, and "sold" has its own chip. Same rule as the web pill.
 */
export function reservedWord(status: string, held: boolean): string | null {
  if (status !== "reserved") return null;
  return held ? "on hold" : "reserved";
}

/**
 * Home's "Needs you" rows deep-link here with ?missing=…; the rules are the web Inventory's
 * (app/infrastructure/admin/inventory/page.tsx `lacks`) so the same pieces answer on both.
 *   photo       — no images
 *   price       — price is zero or missing
 *   cost        — no cost on a LIVE piece (a draft has not been costed yet; a sold one is history)
 *   confidence  — the ids /api/store/attention says intake was unsure about
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
