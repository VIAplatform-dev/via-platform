// Search on the phone — the same "look up anything" box the desktop has, against the same route.
//
// /api/store/search answers { groups: [{ group, hits: [{ id, label, sub, href }] }] } and writes
// the status into `sub` already ("SKU-1042 · $420 · active"), so a row needs no extra call to say
// whether a piece is live, held or sold. The only phone-specific decision is where a tap goes.
//
// Inventory hits also carry `image`, so a result can show the PIECE rather than the word
// "INVENTORY" — see isPiece below for why the group name is compared loosely.

export type SearchHit = {
  id: string;
  label: string;
  sub: string;
  href: string;
  /** The piece's cover photo. Only inventory hits carry one — an order has no picture. */
  image?: string | null;
};
export type SearchGroup = { group: string; hits: SearchHit[] };
export type SearchRow = SearchHit & { group: string };

export function flattenHits(groups: SearchGroup[]): SearchRow[] {
  return groups.flatMap((g) => g.hits.map((h) => ({ ...h, group: g.group })));
}

export type Target = { pathname: string; params: Record<string, string> };

export function hitTarget(group: string, id: string): Target {
  switch (group) {
    case "Inventory": return { pathname: "/(seller)/piece/[id]", params: { id } };
    case "Orders": return { pathname: "/(seller)/orders", params: { id } };
    case "Customers": return { pathname: "/(seller)/customers", params: {} };
    case "Consignors": return { pathname: "/(seller)/consignment", params: {} };
    case "Discounts": return { pathname: "/(seller)/discounts", params: {} };
    default: return { pathname: "/(seller)/inventory", params: {} };
  }
}

export const searchPlaceholder = () => "Search a piece, order, SKU or customer";

/**
 * Is this row a piece, and therefore something we can show a photograph of?
 *
 * Compared case-insensitively because the route labels the group "Inventory" while everything on
 * this side talks in lowercase keys, and a mismatch here fails silently — every row just keeps the
 * text label and nobody notices the pictures never arrived.
 */
export function isPiece(group: string | null | undefined): boolean {
  return String(group ?? "").toLowerCase() === "inventory";
}
