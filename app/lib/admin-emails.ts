// Who VYA's own people are.
//
// This is the list of humans who run VYA — not sellers, not staff at a seller's shop. It decides two
// things: who may hold an admin account, and who is allowed to walk the seller onboarding flow more
// than once (see app/api/store/onboarding/route.ts) so it can be tested and demoed without needing a
// fresh email address every time.
//
// IT IS NOT, BY ITSELF, A WAY IN. Being on this list means you may be INVITED to admin; you still
// set a password from an emailed invite and still pass the 2FA code sent to your own inbox
// (admin-users-db.ts). Making the list grant access on its own would mean anyone who could get a
// session for one of these addresses walked straight into the admin.
//
// Kept in code rather than the database on purpose: it changes about twice a year, it must be
// reviewable in a diff, and a bug that empties a table must never be able to hand out admin.

export const ADMIN_EMAILS: readonly string[] = [
  "hana@vyaplatform.com",
  "avishig5@terpmail.umd.edu",
  "gianna@vyaplatform.com",
  "giannaraucher@gmail.com",
];

/**
 * Is this one of VYA's own people?
 *
 * Compared lowercased and trimmed, because the address arrives from a session, a form or a URL
 * depending on the caller and "Gianna@VYAplatform.com" is the same person.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e) return false;
  return ADMIN_EMAILS.some((a) => a.toLowerCase() === e);
}
