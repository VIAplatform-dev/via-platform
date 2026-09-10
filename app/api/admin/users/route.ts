import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { Resend } from "resend";
import { listAdmins, inviteAdmin, removeAdmin } from "@/app/lib/admin-users-db";
import { getBaseUrl } from "@/app/lib/base-url";
import { ADMIN_EMAILS } from "@/app/lib/admin-emails";

export const dynamic = "force-dynamic";

// Only an already-authenticated admin can manage admins.
async function requireAdmin(): Promise<boolean> {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) return false;
 const token = (await cookies()).get("via_admin_token")?.value;
 return token === crypto.createHash("sha256").update(pw).digest("hex");
}

async function sendInviteEmail(email: string, token: string) {
 const apiKey = process.env.RESEND_API_KEY;
 if (!apiKey) return;
 const link = `${getBaseUrl()}/admin/set-password?token=${token}`;
 const resend = new Resend(apiKey);
 await resend.emails.send({
 from: "VYA Admin <hana@vyaplatform.com>",
 to: email,
 subject: "You've been invited to VYA Admin",
 html: `<!doctype html><html><body style="margin:0;background:#FFFDF8;font-family:Georgia,serif;">
 <div style="max-width:480px;margin:0 auto;padding:40px 16px;">
 <div style="background:#fff;padding:40px 32px;text-align:center;">
 <p style="font-size:13px;color:#5D0F17;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 24px;">VYA Admin</p>
 <p style="font-size:15px;color:#5D0F17;line-height:1.7;margin:0 0 24px;">You've been given access to the VYA admin. Set your password to get started — then you'll sign in with your email, your password, and a one-time code sent to this address.</p>
 <a href="${link}" style="display:inline-block;background:#5D0F17;color:#FFFDF8;text-decoration:none;padding:14px 28px;font-size:14px;letter-spacing:0.05em;">Set your password</a>
 <p style="font-size:12px;color:rgba(93,15,23,0.5);margin:24px 0 0;">This link expires in 7 days. If you didn't expect this, ignore it.</p>
 </div></div></body></html>`,
 });
}

export async function GET() {
 if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const admins = await listAdmins().catch(() => []);
 // Who SHOULD have access, from admin-emails.ts. Sent alongside rather than merged in: a row in
 // this table is a real account with a real password, and a name from a code constant is not — the
 // page shows the difference and offers to close it, rather than implying the four are already set
 // up. `expected` does not grant anything on its own; only an accepted invite does.
 return NextResponse.json({ ok: true, admins, expected: ADMIN_EMAILS });
}

export async function POST(request: NextRequest) {
 if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const email = String(body?.email || "").trim().toLowerCase();
 const invite = await inviteAdmin(email);
 if (!invite) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
 await sendInviteEmail(email, invite.token).catch(() => {});
 const admins = await listAdmins().catch(() => []);
 return NextResponse.json({ ok: true, invited: email, admins });
}

export async function DELETE(request: NextRequest) {
 if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const email = String(body?.email || "").trim().toLowerCase();
 if (!email) return NextResponse.json({ error: "Missing email." }, { status: 400 });
 await removeAdmin(email).catch(() => {});
 const admins = await listAdmins().catch(() => []);
 return NextResponse.json({ ok: true, admins });
}
