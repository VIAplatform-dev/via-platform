import { NextRequest, NextResponse } from "next/server";
import { getStorefrontBySlug } from "@/app/lib/storefront-db";
import { isAdminRequest, resolveStoreSlug } from "@/app/lib/storeAuth";
import { getStoreProfile } from "@/app/lib/store-profile-db";
import { auth } from "@/app/lib/auth";
import { getStoreAccountByOwner } from "@/app/lib/store-accounts-db";
import { addStoreUser } from "@/app/lib/store-users-db";
import { isAdminEmail } from "@/app/lib/admin-emails";

export const dynamic = "force-dynamic";

/** The logo a seller set on her storefront, or "" when she hasn't set one. */
async function storeLogoFor(slug: string): Promise<string> {
 return getStorefrontBySlug(slug)
  .then((sf) => (typeof sf?.theme?.logo === "string" ? sf.theme.logo : "") || "")
  .catch(() => "");
}

// Gate for the /infrastructure/admin workspace. Outcomes so the layout can route:
//  - owner/break-glass admin (ADMIN_PASSWORD)  → { admin: true, slug: "via-admin" }
//  - a store partner signed in with a store    → { admin: false, slug }
//  - signed in but no store yet (fresh signup) → { admin: false, needsOnboarding: true }
//  - not signed in                             → 401 (layout sends them to login)
export async function GET(request: NextRequest) {
 // Local dev (`next dev`) → always the owner workspace, so localhost never bounces to the signup
 // wizard. NODE_ENV is "production" on Vercel prod AND preview deployments, so this only ever
 // applies to a developer's own machine. It can't leak to the live site.
 // ...but a REAL signed-in seller wins over the shortcut, or the seller flow can never be tested
 // locally: every localhost request came back as the owner, so onboarding was unreachable and
 // "Create my store" could only ever fail.
 if (process.env.NODE_ENV === "development") {
  const devSession = await auth().catch(() => null);
  // `dev: true` marks this as the SHORTCUT talking, not a real sign-in. It matters because the
  // proxy gates /admin/* on an actual cookie or session and does not honour this, so a caller that
  // treated the shortcut as a genuine identity would send someone to a page the proxy immediately
  // sends back, forever. The seller sign-in reads this flag; the workspace layout ignores it.
  if (!devSession?.user?.email) return NextResponse.json({ admin: true, slug: "via-admin", dev: true });
 }

 // Owner / break-glass admin: full workspace as the synthetic via-admin store.
 if (isAdminRequest(request)) return NextResponse.json({ admin: true, slug: "via-admin", staff: true });

 const session = await auth();
 if (!session?.user?.email) return NextResponse.json({ admin: false }, { status: 401 });

 // `staff` is a WEAKER claim than `admin`, and separate on purpose. `admin` means this request
 // carries the admin cookie and may drive the owner workspace. `staff` only means the signed-in
 // address belongs to one of VYA's own people (admin-emails.ts), which is enough to be allowed to
 // walk the seller signup flow a second time and nothing else. Gianna testing the flow while
 // signed in as a seller is staff, not admin.
 const staff = isAdminEmail(session.user.email);

 // Signed-in partner: resolve their store (session email → store_users / static map).
 const slug = await resolveStoreSlug(request);
 // `email` on every answer, not just the onboarding one. A seller could not see which address she
 // was signed in with anywhere in the workspace, and with two accounts (a personal one and the
 // shop's) that is the first thing you need when something is missing from a screen.
 if (slug && slug !== "via-admin") {
  const storeName = await getStoreProfile(slug).then((p) => p.displayName).catch(() => slug);
  // HER MARK, for the workspace's own corner. The sidebar drew VYA's logo on a page that is
  // entirely her shop; she has already uploaded one for her storefront, so it is the same asset.
  /* allow-swallow: a shop with no storefront row yet simply has no logo */
  const logo = await storeLogoFor(slug);
  return NextResponse.json({ admin: false, slug, staff, email: session.user.email, storeName, logo });
 }

 // SECOND PLACE TO LOOK, before declaring she has no shop.
 //
 // A store has two records of who owns it: the store_users row (access) and the store_accounts row
 // (the account itself, written at signup). /api/store/onboarding checks BOTH before it will let
 // anyone create a store. This gate checked only the first, so the two could disagree about the
 // same person. When they did, the disagreement was invisible and total: whoami said "no store",
 // the workspace sent her to the wizard, the wizard asked onboarding, onboarding found her account
 // and refused to make a second one, and she was left circling a signup flow for a shop she
 // already owned, unable to reach it.
 //
 // Found here, the missing access row is written back rather than reported: she owns the account,
 // so the row should have existed, and repairing it costs one insert and ends the loop for good.
 const account = await getStoreAccountByOwner(session.user.email).catch(() => null);
 if (account?.slug) {
  await addStoreUser(account.slug, session.user.email, "owner").catch(() => {}); /* allow-swallow: reporting the store matters more than repairing the row */
  // `staff` belongs on THIS answer too. Leaving it off was a real bug: a VYA person whose access
  // row had gone missing came back through the repair path with staff undefined, so the onboarding
  // gate read her as an ordinary seller with a shop and bounced her to Home. The exact symptom
  // reported. Every path that can describe a signed-in person has to describe them the same way.
  const repairedName = await getStoreProfile(account.slug).then((p) => p.displayName).catch(() => account.slug);
  return NextResponse.json({ admin: false, slug: account.slug, repaired: true, staff, email: session.user.email, storeName: repairedName, logo: await storeLogoFor(account.slug) });
 }

 // Authenticated but genuinely attached to nothing → the signup wizard.
 return NextResponse.json({ admin: false, needsOnboarding: true, email: session.user.email, staff });
}
