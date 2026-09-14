// Reading the four places a store's contact address can live. Ordering lives in store-contact.ts.

import { stores, storeContactEmails } from "./stores";
import { getStoreProfile } from "./store-profile-db";
import { listStoreUsers } from "./store-users-db";
import { getStoreAccount } from "./store-accounts-db";
import { pickStoreContact, type ContactSource } from "./store-contact";

export type StoreContact = { email: string; source: ContactSource } | null;

/**
 * Where this store's own mail goes, or null if it genuinely has no address.
 *
 * Every lookup degrades to "no candidate from that source" rather than throwing: a store whose
 * profile row is missing must still receive its mail at the curated address, and a database blip
 * must not turn into a seller silently not hearing that she has an offer.
 */
export async function getStoreContact(storeSlug: string): Promise<StoreContact> {
 const slug = String(storeSlug || "").trim();
 if (!slug) return null;

 const [replyTo, supportEmail, ownerLogin] = await Promise.all([
  import("./email-settings-db")
   .then((m) => m.resolveStoreSender(slug))
   .then((s) => s?.replyTo ?? null)
   .catch(() => null),
  getStoreProfile(slug).then((p) => p.supportEmail).catch(() => null),
  // The owner's sign-in address: the store_users owner first (the access record), then the
  // store_accounts row written at signup. Both exist for a shop that onboarded itself; neither
  // exists for the original curated partners, who have the map instead.
  (async () => {
   const users = await listStoreUsers(slug).catch(() => []);
   const owner = users.find((u) => u.role === "owner") ?? users[0];
   if (owner?.email) return owner.email;
   return await getStoreAccount(slug).then((a) => a?.ownerEmail ?? null).catch(() => null);
  })(),
 ]);

 return pickStoreContact({ replyTo, supportEmail, curated: storeContactEmails[slug] ?? null, ownerLogin });
}

/** Just the address. Null means the store has none — decide what to do rather than defaulting to ops. */
export const getStoreContactEmail = async (storeSlug: string): Promise<string | null> =>
 (await getStoreContact(storeSlug))?.email ?? null;

/** The store's display name, for addressing that mail. */
export const storeDisplayName = (storeSlug: string): string =>
 stores.find((s) => s.slug === storeSlug)?.name || storeSlug;
