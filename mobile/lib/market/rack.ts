// What is on the rack, and finding a piece in it by typing.
//
// Market Mode could only find a piece by PHOTOGRAPHING it. Standing at a stall, the buyer holding
// the thing and asking the price, the answer was: take a picture and wait. You could not type
// "fendi bag". And the home screen showed three numbers but not one item, so there was no way to
// see what you had brought without selling something.
//
// The server already has both halves. /api/store/market/inventory?view=available returns the
// whole rack (up to 2000), and /api/store/market/search does the text lookup. The phone called
// neither. This module is the client half: the rack arrives once, and filtering happens HERE, on
// the phone, because a market has bad signal and the answer should land before she finishes typing.
//
// The matching rule mirrors app/lib/market/inventory-db.ts searchMarketItems deliberately: EVERY
// WORD must appear somewhere in the piece's text, not the whole phrase in one field. No single
// field holds "dior blazer", the brand is "Dior", the title says "Jacket", and a seller typing
// the two words she would actually say must not be told the piece does not exist.

export type RackItem = {
  id: string;
  title: string;
  priceCents: number;
  currency: string;
  image: string | null;
  brand: string | null;
  size: string | null;
  category: string | null;
  status: string;
  onBringList: boolean;
};

/** Statuses a piece can be sold from at a stall. Mirrors find.tsx and the checkout route. */
export const SELLABLE = new Set(["active", "draft", "reserved"]);

/** Everything written on a piece, as one lowercase haystack. */
function haystack(it: RackItem): string {
  return [it.title, it.brand, it.size, it.category].filter(Boolean).join(" ").toLowerCase();
}

/**
 * The rack, narrowed by what she typed.
 *
 * An empty query returns everything. The point is that the rack is visible by default, not that
 * you have to search to see anything.
 */
export function filterRack(items: RackItem[], query: string): RackItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  return items.filter((it) => {
    const hay = haystack(it);
    return words.every((w) => hay.includes(w));
  });
}

/**
 * Rack order: what she brought first, then sellable before reserved, then alphabetically.
 *
 * Alphabetical, not newest-first, and this is the whole point of the screen. She is looking at a
 * rail of clothes and reading a label; "newest" is an order she cannot see from where she stands,
 * so scanning for a name in a list sorted by upload date means reading all of it.
 */
export function sortRack(items: RackItem[]): RackItem[] {
  return [...items].sort(
    (a, b) =>
      Number(b.onBringList) - Number(a.onBringList) ||
      rank(a) - rank(b) ||
      a.title.localeCompare(b.title),
  );
}

function rank(it: RackItem): number {
  if (it.status === "active" || it.status === "draft") return 0;
  if (it.status === "reserved") return 1;
  return 2;
}

/** The line under a piece's name: its price, and anything worth knowing before quoting it. */
export function rackSubtitle(it: RackItem, money: (cents: number, currency: string) => string): string {
  const bits = [money(it.priceCents, it.currency)];
  if (it.size) bits.push(`Size ${it.size}`);
  if (it.status === "reserved") bits.push("reserved");
  if (it.status === "draft") bits.push("draft");
  return bits.join(" · ");
}

/** What the empty state should say, which depends on why it is empty. */
export function rackEmptyMessage(totalItems: number, query: string): string {
  if (totalItems === 0) return "Nothing in your inventory yet. Quick-list a piece to sell it here.";
  if (query.trim()) return `Nothing on the rack matches “${query.trim()}”.`;
  return "Nothing available to sell right now.";
}
