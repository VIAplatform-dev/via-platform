import { NextResponse } from "next/server";
import {
 consumeMagicLinkToken,
 findOrCreateUserByEmail,
 signMobileJwt,
} from "@/app/lib/mobileAuth";
import { storeSlugFromEmail } from "@/app/lib/storeAuth";

export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/auth/magic-link/verify
 * Body: { token: string }
 *
 * Validates the one-time token, finds/creates the user by email,
 * returns a 1-year session JWT.
 */
export async function POST(request: Request) {
 try {
 const body = await request.json();
 const token = (body?.token ?? "").toString().trim();
 if (!token) {
 return NextResponse.json({ error: "Missing token" }, { status: 400 });
 }

 const email = await consumeMagicLinkToken(token);
 if (!email) {
 return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
 }

 const userId = await findOrCreateUserByEmail(email);
 const jwt = signMobileJwt(userId, email);

 // storeSlug alongside the token, matching /api/mobile/auth/me. Without it the app only learns a
 // seller is a seller on the NEXT launch — it routes on this, so a fresh sign-in would drop a store
 // owner into the shopper app.
 return NextResponse.json({ token: jwt, user: { id: userId, email }, storeSlug: storeSlugFromEmail(email) });
 } catch (err) {
 console.error("[mobile-magic-link verify] error:", err);
 return NextResponse.json({ error: "Internal error" }, { status: 500 });
 }
}
