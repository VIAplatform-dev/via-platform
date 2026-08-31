// What a shopper is told when their bag doesn't hold what they expected — and the rule that a bag
// belongs to exactly one store.
//
// Pure: no database, no request. The cart routes decide WHEN to say something; this decides WHAT.

/**
 * Why the bag can't be checked out.
 *
 * "Your bag is empty" was the answer to two very different situations, and it was only true for one
 * of them. On one-of-one vintage the other one is common: a shopper puts a piece in their bag,
 * someone else buys it, and the bag empties itself on the next page load. Being told the bag is
 * empty — when they can remember putting something in it — reads as a bug in the shop, and the one
 * fact that would explain it (the piece sold) is the fact we have.
 *
 * `held` is how many pieces the bag still lists; `titles` are the ones that have gone. A bag that
 * was always empty says so plainly.
 */
export function emptyBagMessage(held: number, titles: string[] = []): string {
 if (held <= 0) return "Your bag is empty.";
 const named = titles.filter(Boolean);
 if (named.length === 1) return `“${named[0]}” sold before you got to checkout — it’s one of a kind, so it’s gone from your bag.`;
 if (named.length > 1) return `The pieces in your bag sold before you got to checkout — they’re one of a kind, so they’re gone.`;
 return "The pieces in your bag are no longer available — one-of-a-kind stock sells fast.";
}

/**
 * WHICH store's bag a request is asking about.
 *
 * A shopper has one bag per store. On a hosted storefront the answer is the HOST — that is what
 * routed the request, so it cannot be re-pointed by a script on the page, which matters because the
 * seller's own JavaScript runs there. VYA's own domain serves every store under one address and has
 * no host to read, so the page says which store it is showing (`?store=`).
 *
 * Null means "we could not tell" — and the caller then reads the whole bag, exactly as it did
 * before bags were per-store. That fallback is what makes this safe to roll through the codebase a
 * page at a time: a caller not yet passing its store behaves as it always did.
 */
export function bagStoreSlug(hostSlug: string | null | undefined, storeParam: string | null | undefined): string | null {
 // Host first, always: a `?store=` on a store's own domain would let one seller's page address
 // another seller's bag.
 if (hostSlug) return hostSlug;
 const param = (storeParam || "").trim().toLowerCase();
 return /^[a-z0-9][a-z0-9-]{0,63}$/.test(param) ? param : null;
}
