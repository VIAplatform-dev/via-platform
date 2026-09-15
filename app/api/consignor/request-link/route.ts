import { NextResponse } from "next/server";
import { getConsignorsByEmail } from "@/app/lib/consignment-db";
import { createMagicLinkToken } from "@/app/lib/mobileAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Consignor requests a sign-in link. We only send one if the email is on file as a consignor,
// but always respond the same way, so the form never reveals who is or isn't a consignor.
export async function POST(request: Request) {
 const body = await request.json().catch(() => null);
 const email = (body?.email ?? "").toString().trim().toLowerCase();
 if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
 return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
 }
 const consignors = await getConsignorsByEmail(email);
 if (consignors.length) {
 try {
 const token = await createMagicLinkToken(email);
 const origin = new URL(request.url).origin;
 await sendConsignorLink(email, `${origin}/api/consignor/verify?token=${token}`);
 } catch (e) {
 console.error("[consignor request-link]", e);
 }
 }
 return NextResponse.json({ ok: true });
}

async function sendConsignorLink(email: string, link: string): Promise<void> {
 const key = process.env.RESEND_API_KEY;
 if (!key) { console.error("[consignor] RESEND_API_KEY not set"); return; }
 const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FFFDF8;font-family:Georgia,'Times New Roman',serif;color:#5D0F17;">
 <div style="max-width:600px;margin:0 auto;padding:40px 24px;">
 <h1 style="font-size:24px;font-weight:400;margin:0 0 16px;">Your consignment statement</h1>
 <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">Tap below to view your items, sales, and balance. This link works once and expires in 15 minutes.</p>
 <a href="${link}" style="display:inline-block;background:#5D0F17;color:#FFFDF8;padding:14px 32px;text-decoration:none;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;">View my statement</a>
 <p style="font-size:12px;color:rgba(93,15,23,0.5);margin-top:32px;line-height:1.5;">If you didn't request this, you can ignore this email.</p>
 </div>
</body></html>`;
 await fetch("https://api.resend.com/emails", {
 method: "POST",
 headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
 body: JSON.stringify({ from: "VYA <hana@vyaplatform.com>", to: email, subject: "Your consignment statement", html }),
 });
}
