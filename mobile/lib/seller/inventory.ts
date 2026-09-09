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

/** The line under the title: how much she has, and what has moved. */
export function inventoryCount(total: number, soldThisWeek: number): string {
  if (total === 0) return "Nothing listed yet";
  const pieces = `${total} ${total === 1 ? "piece" : "pieces"}`;
  if (soldThisWeek === 0) return pieces;
  return `${pieces} · ${soldThisWeek} sold this week`;
}
