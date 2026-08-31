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
 if (process.env.NODE_ENV === "development") return NextResponse.json({ admin: true, slug: "via-admin" });

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
