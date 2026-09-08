import { NextResponse } from "next/server";
import { findOrCreateUserByEmail, getUserById, signMobileJwt } from "@/app/lib/mobileAuth";
import { storeSlugForMobileEmail } from "@/app/lib/storeAuth";

export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/auth/dev-login
 * Header: Authorization: Bearer <ADMIN_PASSWORD>
 * Body: { email }
 *
 * Mints a mobile session for an email WITHOUT the magic-link email round-trip
 * (which can't complete in Expo Go, where deep links don't open the app). Gated
 * by ADMIN_PASSWORD so it can't be used to take over accounts — only someone who
 * already holds the admin secret can mint a token.
 */
export async function POST(request: Request) {
 const adminPassword = process.env.ADMIN_PASSWORD;
 const auth = request.headers.get("authorization") ?? "";
 if (!adminPassword || auth !== `Bearer ${adminPassword}`) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const body = await request.json().catch(() => ({}));
 const email = (body?.email ?? "").toString().trim().toLowerCase();
 if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
 return NextResponse.json({ error: "Invalid email" }, { status: 400 });
 }

 const userId = await findOrCreateUserByEmail(email);
 const user = await getUserById(userId);
 const token = signMobileJwt(userId, email);
 const storeSlug = await storeSlugForMobileEmail(email);
 return NextResponse.json({ token, user, storeSlug });
}
