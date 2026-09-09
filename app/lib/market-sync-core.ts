import type { CrossListing } from "./cross-listing-db";

// The pure half of market-sync: which marketplaces a checkout must ask "did this already sell?"
// before charging. No imports beyond a type, so the decision is testable on its own.

/** Marketplaces that can tell us about a sale. Paste-only channels (Poshmark, Grailed…) cannot. */
export const FEEDS = ["ebay", "depop"] as const;
export type Feed = (typeof FEEDS)[number];

/** Statuses meaning "a buyer on that marketplace can hit Buy right now". */
const LIVE = new Set(["listed", "active", "live"]);

/** Each platform once, however many pieces are in the bag. Empty for a VYA-only piece. */
export function platformsToCheck(listings: CrossListing[]): Feed[] {
 const out: Feed[] = [];
 for (const l of listings) {
  if (!LIVE.has(l.status)) continue;
  if (!(FEEDS as readonly string[]).includes(l.platform)) continue;
  if (!out.includes(l.platform as Feed)) out.push(l.platform as Feed);
 }
 return out;
}
