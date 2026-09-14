import { auth } from "./auth";
import { emailBelongsToStore } from "./store-users-db";
import { getStoreAccountByOwner } from "./store-accounts-db";
import { isAdminEmail } from "./admin-emails";

/**
 * Can the person looking at this storefront work on it?
 *
 * Used to decide whether an UNPUBLISHED shop shows itself or says "not open yet" — so the answer
 * only ever widens what somebody sees of their own shop, and never grants an action.
 *
 * Both ownership records are checked, for the same reason storeSlugForMobileEmail checks both: the
 * access row can be missing on a shop somebody genuinely owns, and being told your own address does
 * not exist is the worst possible way to find that out.
 *
 * Deliberately no admin-password path. This runs on a store's own public origin, where the seller's
 * theme JavaScript is alive; a check that a request could influence from there does not belong.
 * Staff are recognised by their signed-in address only.
 */
export async function viewerCanEdit(storeSlug: string): Promise<boolean> {
 try {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return false;
  if (isAdminEmail(email)) return true;
  if (await emailBelongsToStore(storeSlug, email).catch(() => false)) return true;
  const account = await getStoreAccountByOwner(email).catch(() => null);
  return account?.slug === storeSlug;
 } catch {
  // A session that cannot be read is not an owner. Failing closed here only means she is asked to
  // sign in; failing open would show an unpublished shop to the internet.
  return false;
 }
}
