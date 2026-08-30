// Limits on an item that both the browser and the server need to agree on.
// Deliberately dependency-free so client components can import it without
// dragging a database driver into the bundle.

/**
 * How many photos one listing can carry on VYA.
 *
 * Secondhand buyers can't handle the piece, so photos are the whole inspection:
 * fabric texture, wear, the tag, the flaw the description mentions. Our own
 * catalogue data backs it — sell-through climbs steadily with photo count and is
 * still climbing at the top of the range.
 *
 * This is VYA's cap only. Each marketplace enforces its own and those are set at
 * their own call sites — Depop takes 8, eBay 12 — so a listing with more photos
 * simply sends that channel its first N rather than failing.
 */
export const MAX_ITEM_IMAGES = 15;
