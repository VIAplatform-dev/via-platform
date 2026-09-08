// Search on the phone — the same "look up anything" box the desktop has, against the same route.
//
// /api/store/search answers { groups: [{ group, hits: [{ id, label, sub, href }] }] } and writes
// the status into `sub` already ("SKU-1042 · $420 · active"), so a row needs no extra call to say
// whether a piece is live, held or sold. The only phone-specific decision is where a tap goes.

export type SearchHit = { id: string; label: string; sub: string; href: string };
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
