import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { Resend } from "resend";
import { verifyAdminLogin } from "@/app/lib/admin-users-db";
import { overRateLimit, clientIp } from "@/app/lib/rate-limit-db";

const FALLBACK_OTP_EMAIL = "hana@vyaplatform.com";

function hashPassword(password: string): string {
 return crypto.createHash("sha256").update(password).digest("hex");
}

function generateOtp(): string {
 return String(crypto.randomInt(100000, 999999));
}

/** Signs an OTP + expiry with HMAC so it can be stored in a cookie safely */
function signOtp(otp: string, expiry: number): string {
 const key = process.env.ADMIN_PASSWORD ?? "via-admin";
 const sig = crypto
 .createHmac("sha256", key)
 .update(`${otp}:${expiry}`)
 .digest("hex");
 return `${otp}:${expiry}:${sig}`;
}

/** Returns the OTP string if the cookie is valid and not expired, otherwise null */
function verifyOtpCookie(cookieValue: string): string | null {
 const parts = cookieValue.split(":");
 if (parts.length !== 3) return null;
 const [otp, expiryStr, sig] = parts;
 const expiry = parseInt(expiryStr, 10);
 if (isNaN(expiry) || Date.now() > expiry) return null;

 const key = process.env.ADMIN_PASSWORD ?? "via-admin";
 const expected = crypto
 .createHmac("sha256", key)
 .update(`${otp}:${expiry}`)
 .digest("hex");

 try {
 if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) {
 return null;
 }
 } catch {
 return null;
 }
 return otp;
}

async function sendOtpEmail(otp: string, to: string = FALLBACK_OTP_EMAIL) {
 const resend = new Resend(process.env.RESEND_API_KEY);
 await resend.emails.send({
 from: "VYA Admin <hana@vyaplatform.com>",
 to,
 subject: `${otp} — VYA Admin Sign-In Code`,
 html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<style>
:root { color-scheme: light only; }
body { margin: 0; padding: 0; background-color: #FFFDF8; font-family: Georgia, 'Times New Roman', serif; }
@media (prefers-color-scheme: dark) {
 body { background-color: #FFFDF8 !important; }
 .wrapper { background-color: #FFFDF8 !important; }
 .content { background-color: #ffffff !important; }
 .code-box { background-color: #FFFDF8 !important; color: #5D0F17 !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background-color:#FFFDF8;">
<div class="wrapper" style="background-color:#FFFDF8;padding:40px 16px;">
 <div style="max-width:480px;margin:0 auto;">
 <div class="content" style="background:#ffffff;padding:40px 32px;text-align:center;">
 <p style="font-size:13px;color:#5D0F17;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 24px;">VYA Admin</p>
 <p style="font-size:15px;color:#5D0F17;margin:0 0 24px;">Your sign-in code:</p>
 <div class="code-box" style="background:#FFFDF8;padding:20px;font-size:36px;font-family:monospace;letter-spacing:0.3em;color:#5D0F17;margin:0 0 24px;">
 ${otp}
 </div>
 <p style="font-size:12px;color:rgba(93,15,23,0.5);margin:0;">Expires in 10 minutes. If you didn't request this, ignore it.</p>
 </div>
 </div>
</div>
</body>
</html>`,
 });
}

export async function POST(request: Request) {
 try {
 // Throttle per IP: caps password brute-force AND the OTP emails each password submit triggers.
 // A real sign-in is only a couple of requests, so 20 / 15 min is generous.
 const ip = clientIp(request.headers);
 if (await overRateLimit({ bucket: "admin-auth", ip, max: 20, windowMinutes: 15 })) {
 return NextResponse.json(
 { error: "Too many attempts. Please wait a few minutes and try again." },
 { status: 429 }
 );
 }
 const { email, password, otpCode } = await request.json();
 const expectedPassword = process.env.ADMIN_PASSWORD;

 if (!expectedPassword) {
 return NextResponse.json(
 { error: "Admin access not configured" },
 { status: 500 }
 );
 }

 // Per-user admin (email + their own password) sends the 2FA code to THEIR inbox;
 // no email falls back to the shared ADMIN_PASSWORD → code to the fallback inbox.
 let otpRecipient = FALLBACK_OTP_EMAIL;
 const loginEmail = (email || "").trim().toLowerCase();
 if (loginEmail) {
 const ok = await verifyAdminLogin(loginEmail, password).catch(() => null);
 if (!ok) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
 otpRecipient = ok;
 } else if (password !== expectedPassword) {
 return NextResponse.json({ error: "Invalid password" }, { status: 401 });
 }

 // Step 2: password + OTP code submitted
 if (otpCode) {
 const cookieStore = await cookies();
 const pendingCookie = cookieStore.get("via_admin_otp")?.value;

 if (!pendingCookie) {
 return NextResponse.json(
 { error: "Code expired. Please try again." },
 { status: 401 }
 );
 }

 const validOtp = verifyOtpCookie(pendingCookie);
 if (!validOtp) {
 return NextResponse.json(
 { error: "Code expired. Please try again." },
 { status: 401 }
 );
 }

 const submitted = otpCode.replace(/\s/g, "");
 const isMatch = crypto.timingSafeEqual(
 Buffer.from(submitted.padEnd(6, " ")),
 Buffer.from(validOtp.padEnd(6, " "))
 );
 if (!isMatch) {
 // Invalidate the challenge on a wrong guess so the 6-digit code can't be brute-forced —
 // one guess per issued code. A mistyped code just means requesting a fresh one.
 cookieStore.delete("via_admin_otp");
 return NextResponse.json(
 { error: "Incorrect code — request a new one." },
 { status: 401 }
 );
 }

 // Valid — set auth cookie and clear OTP cookie
 cookieStore.set("via_admin_token", hashPassword(expectedPassword), {
 httpOnly: true,
 secure: process.env.NODE_ENV === "production",
 sameSite: "lax",
 maxAge: 60 * 60 * 24 * 7,
 path: "/",
 });
 cookieStore.delete("via_admin_otp");
 return NextResponse.json({ success: true });
 }

 // Dev bypass: skip OTP on localhost
 if (process.env.NODE_ENV === "development") {
 const cookieStore = await cookies();
 cookieStore.set("via_admin_token", hashPassword(expectedPassword), {
 httpOnly: true,
 secure: false,
 sameSite: "lax",
 maxAge: 60 * 60 * 24 * 7,
 path: "/",
 });
 return NextResponse.json({ success: true });
 }

 // Step 1: password only — generate and send OTP
 const otp = generateOtp();
 const expiry = Date.now() + 10 * 60 * 1000; // 10 minutes
 const cookieStore = await cookies();
 cookieStore.set("via_admin_otp", signOtp(otp, expiry), {
 httpOnly: true,
 secure: process.env.NODE_ENV === "production",
 sameSite: "lax",
 maxAge: 60 * 10,
 path: "/",
 });

 await sendOtpEmail(otp, otpRecipient);
 return NextResponse.json({ requireOtp: true });
 } catch {
 return NextResponse.json({ error: "Invalid request" }, { status: 400 });
 }
}

// Logout endpoint
export async function DELETE() {
 const cookieStore = await cookies();
 cookieStore.delete("via_admin_token");
 cookieStore.delete("via_admin_otp");
 return NextResponse.json({ success: true });
}
