import { NextResponse } from "next/server";
import {
 findOrCreateUserByEmail,
 signMobileJwt,
} from "@/app/lib/mobileAuth";
import { getPilotStatus } from "@/app/lib/pilot-db";
import { storeSlugFromEmail } from "@/app/lib/storeAuth";

export const dynamic = "force-dynamic";

/**
 * POST /api/mobile/auth/google
 * Body: { idToken: string }
 *
 * Verifies the Google idToken with Google's tokeninfo endpoint and issues
 * an app session JWT.
 */
export async function POST(request: Request) {
 try {
 const body = await request.json();
 const idToken = (body?.idToken ?? "").toString().trim();
 if (!idToken) {
 return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
 }

 const verifyRes = await fetch(
 `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
 );
 if (!verifyRes.ok) {
 return NextResponse.json({ error: "Invalid Google token" }, { status: 401 });
 }
 const info = (await verifyRes.json()) as {
 email?: string;
 email_verified?: string | boolean;
 name?: string;
 aud?: string;
 iss?: string;
 exp?: string;
 };

 // Basic validation
 const validIss = info.iss === "accounts.google.com" || info.iss === "https://accounts.google.com";
 const verified = info.email_verified === true || info.email_verified === "true";
 const expOk = info.exp ? Number(info.exp) * 1000 > Date.now() : false;

 if (!info.email || !validIss || !verified || !expOk) {
 return NextResponse.json({ error: "Token failed validation" }, { status: 401 });
 }

 // Optional: check audience matches one of our configured Google client IDs.
 const allowedAudiences = [
 process.env.GOOGLE_CLIENT_ID,
 process.env.GOOGLE_CLIENT_ID_IOS,
 process.env.GOOGLE_CLIENT_ID_WEB,
 ].filter(Boolean);
 if (allowedAudiences.length > 0 && !allowedAudiences.includes(info.aud)) {
 return NextResponse.json({ error: "Token audience mismatch" }, { status: 401 });
 }

 const email = info.email.toLowerCase();
 const userId = await findOrCreateUserByEmail(email, info.name);
 const jwt = signMobileJwt(userId, email);

 // Approval status so the app can show a "you're on the waitlist" screen instead of
 // empty/erroring catalog calls — content endpoints (/api/public/*) now require approval.
 const status = await getPilotStatus(email).catch(() => "pending");

 return NextResponse.json({
 token: jwt,
 user: { id: userId, email, name: info.name ?? null },
 approved: status === "approved",
 status,
 // Matches /api/mobile/auth/me — the app routes sellers to their own tabs on this.
 storeSlug: storeSlugFromEmail(email),
 });
 } catch (err) {
 console.error("[mobile-google] error:", err);
 return NextResponse.json({ error: "Internal error" }, { status: 500 });
 }
}
