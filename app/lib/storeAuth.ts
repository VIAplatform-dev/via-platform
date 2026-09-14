import { NextRequest } from "next/server";
import crypto from "crypto";
import { auth } from "./auth";
import { storeContactEmails } from "./stores";
import { getMobilePayload } from "./mobileAuth";
import { pickStoreSlug } from "./store-slug-core";
import { storeSlugForEmail, emailBelongsToStore, addStoreUser } from "./store-users-db";
import { getStoreAccountByOwner } from "./store-accounts-db";

// ───────────────────────────────────────────────────────────────────────────
// Store-portal auth resolution. Normally the store is the logged-in partner
// (session email → slug). But an ADMIN can preview any store's portal exactly as
// that store sees it by passing ?store=<slug> — so admin views never drift from
// what sellers actually see (same endpoints, same code).
// ───────────────────────────────────────────────────────────────────────────

function hashPassword(p: string): string {
 return crypto.createHash("sha256").update(p).digest("hex");
}

export function isAdminRequest(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === hashPassword(adminPassword);
}

/** The owner/tester (you): full admin (password/cookie) OR signed into the portal
 *  as the via-admin store. Gates owner-only destructive actions like inventory reset. */
export function isOwner(request: NextRequest, slug: string | null): boolean {
 return isAdminRequest(request) || slug === "via-admin";
}

export function storeSlugFromEmail(email: string): string | null {
 for (const [slug, storeEmail] of Object.entries(storeContactEmails)) {
 if (storeEmail && storeEmail.toLowerCase() === email.toLowerCase()) return slug;
 }
 return null;
}

// The store this request is acting as: an admin preview (?store= + admin auth),
// otherwise the logged-in store partner. null if neither.
export async function resolveStoreSlug(request: NextRequest): Promise<string | null> {
 const preview = request.nextUrl.searchParams.get("store");
 if (preview && isAdminRequest(request)) return preview;
 const session = await auth();
 if (session?.user?.email) {
 // A STORE IN THE URL, FOR THE PEOPLE WHO BELONG TO IT.
 //
 // `?store=` used to be admin-only, which made it an impersonation tool rather than an address. But
 // store_users is UNIQUE(store_slug, email), so one person can genuinely work at two shops — and
 // storeSlugForEmail() answers with LIMIT 1, meaning she was dropped into whichever the ORDER BY
 // picked, with nothing naming it and no way to move. Honouring an explicit slug SHE HAS ACCESS TO
 // is what makes /admin/inventory?store=her-shop a real, shareable address instead of a guess.
 //
 // Authorised every time, per request: membership is the check, never the fact that she asked.
 if (preview) {
  /* allow-swallow: a DB blip must fall through to her default store, never grant a store */
  const allowed = await emailBelongsToStore(preview, session.user.email).catch(() => false);
  if (allowed) return preview;
 }
 // Her own last choice, when she has more than one shop and picked one. Same authorisation.
 const chosen = request.cookies.get("via_store")?.value;
 if (chosen && chosen !== preview) {
  const allowed = await emailBelongsToStore(chosen, session.user.email).catch(() => false);
  if (allowed) return chosen;
 }
 // store_users FIRST, the hardcoded map second.
 //
 // store-users-db.ts describes itself as "the DYNAMIC, self-serve replacement for the hardcoded
 // storeContactEmails map", and a replacement that loses to the thing it replaces never applies to
 // anyone already in that map. That is not hypothetical: a curated marketplace seller who then
 // brings her own site over has two identities — her marketplace slug and her hosted store's slug —
 // and the static map would keep sending her to the marketplace one, where her site isn't. She then
 // meets an import screen that thinks she has no site and offers to crawl one.
 //
 // storeContactEmails is not a login table anyway: it is also the address book for store emails and
 // the roster the sourcing/digest crons iterate. Editing it to fix a login edits all three, which is
 // why the fix belongs here instead.
 //
 // Stores with no store_users row — every curated store today — fall through unchanged.
 //
 // The catch is deliberate, not laziness: this lookup now runs BEFORE the static map, so without it
 // a database blip would take out curated sellers' logins too, where previously they resolved from
 // memory and never touched the database. Falling through to the map is the old behaviour exactly.
 /* allow-swallow: DB unreachable must degrade to the static map, not lock every seller out */
 const dbSlug = await storeSlugForEmail(session.user.email).catch(() => null);
 if (dbSlug) return dbSlug;
 const slug = storeSlugFromEmail(session.user.email);
 if (slug) return slug;
 }
 // The infrastructure/admin area (owner's build workspace) drives the store portal
 // endpoints as the synthetic via-admin store. An admin with no explicit ?store and
 // no store-partner session acts as via-admin.
 if (isAdminRequest(request)) return "via-admin";
 return null;
}

/**
 * Resolve the acting store slug for an endpoint shared by the web store portal
 * AND the in-app store dashboard. Tries the web session/admin path first, then
 * falls back to the mobile JWT (the store partner signed into the app). Returns
 * null if the request isn't an authenticated store on either surface.
 */
export async function resolveStoreSlugAny(request: NextRequest): Promise<string | null> {
 const web = await resolveStoreSlug(request);
 if (web) return web;
 const payload = getMobilePayload(request);
 if (payload?.email) return storeSlugForMobileEmail(payload.email);
 return null;
}

/**
 * The store a MOBILE session acts as.
 *
 * THREE PLACES SAY WHO OWNS A SHOP, and they can disagree:
 *   · store_users     — access. Who may work on this shop.
 *   · store_accounts  — the account itself, written at signup, with an owner_email.
 *   · storeContactEmails — the hardcoded map, from before either existed.
 *
 * The WEB gate (whoami) reads all three and, when it finds an account with no access row, writes
 * the missing row back rather than reporting a problem. This read only the first and the third. So
 * a seller whose access row never got written — the exact case whoami exists to repair — could sign
 * in on her laptop and not on her phone, and the app told her she had no shop while the website was
 * showing it to her. Nothing about that looks like one bug; it looks like the app being broken.
 *
 * Same three places now, same repair. The lookups are ordered as resolveStoreSlug orders them, for
 * the same reason: a curated seller who later brought her own site over has two slugs, and the
 * static map would sign her phone into the marketplace one, where her inventory isn't.
 */
export async function storeSlugForMobileEmail(email: string): Promise<string | null> {
 /* allow-swallow: DB unreachable must degrade to the static map, not lock the phone out */
 const dbSlug = await storeSlugForEmail(email).catch(() => null);
 const fromAccess = pickStoreSlug({ dbSlug, staticSlug: storeSlugFromEmail(email) });
 if (fromAccess) return fromAccess;

 // She owns the account but has no access row. The row should have existed; write it and carry on,
 // exactly as the web gate does — repairing costs one insert and ends the mismatch for good.
 const account = await getStoreAccountByOwner(email).catch(() => null);
 if (account?.slug) {
  await addStoreUser(account.slug, email, "owner").catch(() => {}); /* allow-swallow: signing her in matters more than the repair */
  return account.slug;
 }
 return null;
}
