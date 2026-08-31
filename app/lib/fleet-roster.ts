/**
 * Which stores the fleet actually checks.
 *
 * Two of the 23 captures are the SAME shop imported twice: `test-import` is
 * the-objects-of-affection and `test-import-2` is bag-crush (identical feeds, identical 33
 * skipped pieces). Checking both doubles the run for no information, and every finding on a copy
 * is counted a second time in the census as though it were another seller's store.
 *
 * The REAL store is the one that stays, even when the copy grades better: test-import passes clean
 * while the-objects-of-affection fails on the one finding that matters. Keeping the copy because it
 * looks healthier would be hiding the problem, not fixing it.
 *
 * Every exclusion carries its reason. A bare list of slugs is the kind of thing nobody dares delete
 * from two months later.
 */
export const EXCLUDED_STORES = new Map<string, string>([
 ["test-import", "a second import of the-objects-of-affection — same shop, same feed"],
 ["test-import-2", "a second import of bag-crush — same shop, same feed, same 33 skipped pieces"],
]);

/** @param all every captured store slug, in whatever order the caller has them. */
export function fleetStores(all: string[]): string[] {
 return all.filter((s) => !EXCLUDED_STORES.has(s));
}
