// Which shop a signed-in person is looking at.
//
// Pulled out of storeAuth.ts so the rule can be tested without a session, a database or a request:
// it is the sentence "she sees the shop she asked for, if it is hers" and it decides what every
// endpoint in the workspace reads and writes.
//
// The rule this replaces was a single SQL `LIMIT 1`. store_users is UNIQUE(store_slug, email), so a
// person can genuinely work at two shops, and she was dropped into whichever one the ORDER BY chose
// — nothing on screen named it, and there was no way to move.

export type StoreChoice = {
 /** The shop to act as, or null when she belongs to none. */
 slug: string | null;
 /** Why, so the workspace can tell "I picked for you" from "you picked". */
 reason: "asked" | "remembered" | "only-one" | "fallback" | "none";
 /** True when she has more than one and has not chosen — the workspace should ask. */
 shouldAsk: boolean;
};

/**
 * @param asked  a slug in the URL (?store=)
 * @param remembered a slug she chose before (cookie)
 * @param memberOf every shop she belongs to, owners' first
 */
export function chooseStore(asked: string | null | undefined, remembered: string | null | undefined, memberOf: string[]): StoreChoice {
 const mine = new Set(memberOf.filter(Boolean));
 // Asking for a shop that isn't hers is not an error to shout about — it is a stale link or a
 // bookmark from a job she has left. She falls back to her own shop rather than being locked out.
 if (asked && mine.has(asked)) return { slug: asked, reason: "asked", shouldAsk: false };
 if (remembered && mine.has(remembered)) return { slug: remembered, reason: "remembered", shouldAsk: false };
 if (memberOf.length === 1) return { slug: memberOf[0], reason: "only-one", shouldAsk: false };
 if (memberOf.length > 1) {
  // Still resolves to something: an endpoint that returned nothing here would 401 a real seller
  // mid-session. It picks her first shop AND says it is asking, so the workspace can put the
  // question on screen without anything breaking underneath.
  return { slug: memberOf[0], reason: "fallback", shouldAsk: true };
 }
 return { slug: null, reason: "none", shouldAsk: false };
}
