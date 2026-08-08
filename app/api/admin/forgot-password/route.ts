import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { requestPasswordReset } from "@/app/lib/admin-users-db";
import { getBaseUrl } from "@/app/lib/base-url";
import { overRateLimit, clientIp } from "@/app/lib/rate-limit-db";

export const dynamic = "force-dynamic";

// Public, unauthenticated: a locked-out admin requests a password-reset link to THEIR inbox.
// Always responds with a generic success so it can't be used to discover which emails are admins.

async function sendResetEmail(email: string, token: string) {
 const apiKey = process.env.RESEND_API_KEY;
 if (!apiKey) return;
 const link = `${getBaseUrl()}/admin/set-password?token=${token}`;
 const resend = new Resend(apiKey);
 await resend.emails.send({
  from: "VYA Admin <hana@vyaplatform.com>",
  to: email,
  subject: "Reset your VYA Admin password",
  html: `<!doctype html><html><body style="margin:0;background:#FFFDF8;font-family:Georgia,serif;">
  <div style="max-width:480px;margin:0 auto;padding:40px 16px;">
   <div style="background:#fff;padding:40px 32px;text-align:center;">
    <p style="font-size:13px;color:#5D0F17;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 24px;">VYA Admin</p>
    <p style="font-size:15px;color:#5D0F17;line-height:1.7;margin:0 0 24px;">We received a request to reset your VYA admin password. Choose a new one below — then sign in with your email, your new password, and the one-time code sent to this address.</p>
    <a href="${link}" style="display:inline-block;background:#5D0F17;color:#FFFDF8;text-decoration:none;padding:14px 28px;font-size:14px;letter-spacing:0.05em;">Reset your password</a>
    <p style="font-size:12px;color:rgba(93,15,23,0.5);margin:24px 0 0;">This link expires in 1 hour. If you didn't request this, ignore it — your password won't change.</p>
   </div></div></body></html>`,
 });
}

export async function POST(request: NextRequest) {
 // Throttle reset-email sends per IP. Return the same generic ok on limit so an attacker can't
 // distinguish rate-limit state from a normal request (preserves the no-enumeration guarantee).
 const ip = clientIp(request.headers);
 if (await overRateLimit({ bucket: "admin-forgot", ip, max: 5, windowMinutes: 60 })) {
  return NextResponse.json({ ok: true });
 }
 const body = await request.json().catch(() => null);
 const email = String(body?.email || "").trim().toLowerCase();
 // Only email a link if this is a known active admin; otherwise silently no-op.
 const reset = email ? await requestPasswordReset(email).catch(() => null) : null;
 if (reset) await sendResetEmail(reset.email, reset.token).catch(() => {});
 // Generic response regardless — no user enumeration.
 return NextResponse.json({ ok: true });
}
