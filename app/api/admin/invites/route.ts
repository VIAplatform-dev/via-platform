import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { listInvites, inviteSeller, revokeInvite } from "@/app/lib/seller-invites-db";
import { normaliseEmail, isEmail } from "@/app/lib/seller-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Who may open a store on VYA. The VYA owner's list, not a store's — so this is gated on the admin
// cookie rather than on a store session. A store owner inviting people to VYA itself would be
// handing out our front door.
function isVyaOwner(request: NextRequest): boolean {
 const pw = process.env.ADMIN_PASSWORD;
 const token = request.cookies.get("via_admin_token")?.value;
 return Boolean(pw && token && token === crypto.createHash("sha256").update(pw).digest("hex"));
}

export async function GET(request: NextRequest) {
 if (!isVyaOwner(request)) return NextResponse.json({ error: "Not found" }, { status: 404 });
 return NextResponse.json({ ok: true, invites: await listInvites() });
}

export async function POST(request: NextRequest) {
 if (!isVyaOwner(request)) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const b = await request.json().catch(() => null);
 const email = normaliseEmail(b?.email);
 if (!isEmail(email)) return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
 await inviteSeller(email, {
  note: b?.note ? String(b.note).slice(0, 200) : null,
  reserveSlug: b?.reserveSlug ? String(b.reserveSlug).trim().toLowerCase().slice(0, 60) : null,
  invitedBy: "admin",
 });
 return NextResponse.json({ ok: true, invites: await listInvites() });
}

export async function DELETE(request: NextRequest) {
 if (!isVyaOwner(request)) return NextResponse.json({ error: "Not found" }, { status: 404 });
 const email = normaliseEmail(new URL(request.url).searchParams.get("email"));
 if (!email) return NextResponse.json({ error: "Which email?" }, { status: 400 });
 await revokeInvite(email);
 return NextResponse.json({ ok: true, invites: await listInvites() });
}
