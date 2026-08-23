import { NextResponse } from "next/server";
import { createMagicLinkToken, findOrCreateUserByEmail, signMobileJwt } from "@/app/lib/mobileAuth";
import { overRateLimit, clientIp } from "@/app/lib/rate-limit-db";

export const dynamic = "force-dynamic";

// A fixed demo account that signs in instantly (see the short-circuit in POST) so
// Apple's Beta App Review can get past the passwordless login wall. It's a plain
// shopper account — no admin or store access — so this is harmless.
const REVIEWER_EMAIL = "partnerships@vyaplatform.com";

/**
 * POST /api/mobile/auth/magic-link/request
 * Body: { email: string, scheme?: string }
 *
 * Generates a one-time magic-link token, sends an email with a deep link
 * back into the mobile app: `<scheme>://auth/callback?token=<token>`.
 * Default scheme is "vya".
 */
export async function POST(request: Request) {
 try {
 const ip = clientIp(request.headers);
 if (await overRateLimit({ bucket: "mobile-magic-link", ip, max: 6, windowMinutes: 15 })) {
 return NextResponse.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });
 }
 const body = await request.json();
 const rawEmail = (body?.email ?? "").toString().trim().toLowerCase();
 const scheme = (body?.scheme ?? "vya").toString().replace(/[^a-z0-9+.-]/gi, "");

 if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
 return NextResponse.json({ error: "Invalid email" }, { status: 400 });
 }

 // Reviewer/demo short-circuit: sign in instantly, no email round-trip.
 if (rawEmail === REVIEWER_EMAIL) {
 const userId = await findOrCreateUserByEmail(rawEmail);
 const jwt = signMobileJwt(userId, rawEmail);
 return NextResponse.json({ ok: true, token: jwt, user: { id: userId, email: rawEmail } });
 }

 const token = await createMagicLinkToken(rawEmail);
 const link = `${scheme}://auth/callback?token=${token}`;

 // Send email via Resend (same provider used by web auth)
 const RESEND_KEY = process.env.RESEND_API_KEY;
 if (!RESEND_KEY) {
 console.error("[mobile-magic-link] RESEND_API_KEY not set");
 return NextResponse.json({ error: "Email not configured" }, { status: 500 });
 }

 const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FFFDF8;font-family:Georgia,'Times New Roman',serif;color:#5D0F17;">
 <div style="max-width:600px;margin:0 auto;padding:40px 24px;">
 <h1 style="font-size:24px;font-weight:400;margin:0 0 16px;">Sign in to VYA</h1>
 <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">
  Tap the button below from your phone to sign in to the VYA app. This link works once and expires in 15 minutes.
 </p>
 <a href="${link}" style="display:inline-block;background:#5D0F17;color:#FFFDF8;padding:14px 32px;text-decoration:none;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;">
  Open VYA app
 </a>
 <p style="font-size:12px;color:rgba(93,15,23,0.5);margin-top:32px;line-height:1.5;">
  If you didn't request this, you can ignore this email.
 </p>
 </div>
</body>
</html>`;

 const resendRes = await fetch("https://api.resend.com/emails", {
 method: "POST",
 headers: {
 "Content-Type": "application/json",
 Authorization: `Bearer ${RESEND_KEY}`,
 },
 body: JSON.stringify({
 from: "VYA <hana@vyaplatform.com>",
 to: rawEmail,
 subject: "Sign in to VYA",
 html,
 }),
 });

 if (!resendRes.ok) {
 const detail = await resendRes.text();
 console.error("[mobile-magic-link] Resend failed:", resendRes.status, detail);
 return NextResponse.json({ error: "Failed to send email" }, { status: 502 });
 }

 return NextResponse.json({ ok: true });
 } catch (err) {
 console.error("[mobile-magic-link request] error:", err);
 return NextResponse.json({ error: "Internal error" }, { status: 500 });
 }
}
