// The four tiles across the top of Home — which four, and in what order.
//
// Home used to render an unbounded list: four fixed tiles (ship, offers, drafts, live listings)
// always first, then every row from attention-core appended after them. A seller with nothing to
// ship and no offers still got both as zeros in the top row, which pushed "21 pieces failed to post"
// onto a second row: "if they have 0 parcels and 0 offers then it should flag the other stuff."
//
// So: four slots. Whatever is genuinely waiting claims them first, in tier order; the resting four
// fill anything left over. A quiet store still gets a full, calm row.
//
// Pure, and separate from attention-core's `attentionRows` on purpose — that list feeds the phone hub
// and Inventory too, and those want everything, not the top four.

import type { AttentionRow } from "./attention-core.ts";

/** attention-core's rows, plus the four Home counts that aren't in it. */
export type TileId = AttentionRow["id"] | "toShip" | "offers" | "drafts" | "liveListings";

export type Tile = {
 id: TileId;
 label: string;
 count: number;
 href: string;
 urgent?: boolean;
 /** A status tile rather than a job — rendered calm, never amber. */
 good?: boolean;
};

export const HOME_TILE_COUNT = 4;

/**
 * What claims a slot, most pressing first. By TIER, not by count: forty unpriced pieces are a
 * afternoon's work, one paid parcel is a person waiting, and a row that reshuffles every time a
 * number ticks can't be learned.
 */
const PRESSING_ORDER: TileId[] = [
 // Someone is waiting, and there is money attached.
 "toShip",
 "offers",
 "unanswered24h",
 "pickupsWaiting",
 "holdsToday",
 "payoutsDue",
 // Broken.
 "crossListingFailed",
 // Can't sell yet.
 "noPhoto",
 "unpriced",
 "lowConfidence",
 // Housekeeping.
 "costMissing",
 "aging",
];

/** What fills the slots nothing pressing claimed. Shown even at zero — this is the calm state. */
const RESTING_ORDER: TileId[] = ["toShip", "drafts", "liveListings", "offers"];

export function homeTiles(all: Tile[], limit = HOME_TILE_COUNT): Tile[] {
 const byId = new Map<TileId, Tile>();
 for (const t of all) if (!byId.has(t.id)) byId.set(t.id, t);

 const out: Tile[] = [];
 const taken = new Set<TileId>();
 const take = (t: Tile | undefined) => {
  if (!t || taken.has(t.id) || out.length >= limit) return;
  taken.add(t.id);
  out.push(t);
 };

 for (const id of PRESSING_ORDER) {
  const t = byId.get(id);
  if (t && t.count > 0) take(t);
 }
 for (const id of RESTING_ORDER) take(byId.get(id));
 // A row added to attention-core but never added to the ladder above would otherwise never appear.
 // It sorts last and only when it has a count, so forgetting to rank something is a cosmetic
 // mistake rather than an invisible one.
 for (const t of all) if (t.count > 0) take(t);

 return out;
}
