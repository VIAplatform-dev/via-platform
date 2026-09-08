import { NextResponse } from "next/server";
import { getMobileUserId, getUserById, signMobileJwt } from "@/app/lib/mobileAuth";
import { storeSlugForMobileEmail } from "@/app/lib/storeAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/auth/me
 * Header: Authorization: Bearer <jwt>
 *
 * Returns current user + a freshly-renewed JWT (auto-renew on every call).
 */
export async function GET(request: Request) {
 const userId = getMobileUserId(request);
 if (!userId) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 const user = await getUserById(userId);
 if (!user) {
 return NextResponse.json({ error: "User not found" }, { status: 404 });
 }
 const refreshed = signMobileJwt(user.id, user.email);
 // If this account's email matches a store contact, the app shows the store
 // dashboard (inbox + replies) instead of / in addition to the shopper UI.
 const storeSlug = await storeSlugForMobileEmail(user.email);
 return NextResponse.json({ user, token: refreshed, storeSlug });
}
