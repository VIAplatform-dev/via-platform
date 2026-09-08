// Which store an email acts as, when two sources disagree.
//
// store_users (self-serve, the hosted store she brought over) beats storeContactEmails (the
// hardcoded curated-marketplace roster). Same rule as the web session resolver in storeAuth.ts —
// this file exists so the phone routes and the web can share it and a test can pin it.
export function pickStoreSlug(o: { dbSlug: string | null | undefined; staticSlug: string | null | undefined }): string | null {
 return o.dbSlug || o.staticSlug || null;
}
