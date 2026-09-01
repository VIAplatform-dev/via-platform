import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, resolveStoreSlug } from "@/app/lib/storeAuth";
import { auth } from "@/app/lib/auth";

export const dynamic = "force-dynamic";

// Gate for the /infrastructure/admin workspace. Outcomes so the layout can route:
//  - owner/break-glass admin (ADMIN_PASSWORD)  → { admin: true, slug: "via-admin" }
//  - a store partner signed in with a store    → { admin: false, slug }
//  - signed in but no store yet (fresh signup) → { admin: false, needsOnboarding: true }
//  - not signed in                             → 401 (layout sends them to login)
export async function GET(request: NextRequest) {
 // Local dev (`next dev`) → always the owner workspace, so localhost never bounces to the signup
 // wizard. NODE_ENV is "production" on Vercel prod AND preview deployments, so this only ever
 // applies to a developer's own machine — it can't leak to the live site.
 // ...but a REAL signed-in seller wins over the shortcut, or the seller flow can never be tested
 // locally: every localhost request came back as the owner, so onboarding was unreachable and
 // "Create my store" could only ever fail.
 if (process.env.NODE_ENV === "development") {
  const devSession = await auth().catch(() => null);
  // `dev: true` marks this as the SHORTCUT talking, not a real sign-in. It matters because the
  // proxy gates /admin/* on an actual cookie or session and does not honour this — so a caller that
  // treated the shortcut as a genuine identity would send someone to a page the proxy immediately
  // sends back, forever. The seller sign-in reads this flag; the workspace layout ignores it.
  if (!devSession?.user?.email) return NextResponse.json({ admin: true, slug: "via-admin", dev: true });
 }

 // Owner / break-glass admin: full workspace as the synthetic via-admin store.
 if (isAdminRequest(request)) return NextResponse.json({ admin: true, slug: "via-admin" });

 const session = await auth();
 if (!session?.user?.email) return NextResponse.json({ admin: false }, { status: 401 });

 // Signed-in partner: resolve their store (session email → store_users / static map).
 const slug = await resolveStoreSlug(request);
 if (slug && slug !== "via-admin") return NextResponse.json({ admin: false, slug });

 // Authenticated but not attached to any store → send them through onboarding.
 return NextResponse.json({ admin: false, needsOnboarding: true, email: session.user.email });
}
