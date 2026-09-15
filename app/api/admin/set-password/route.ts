import { NextRequest, NextResponse } from "next/server";
import { emailForInvite, setPasswordFromInvite } from "@/app/lib/admin-users-db";

export const dynamic = "force-dynamic";

// GET: validate an invite token and return the email it's for (or null).
export async function GET(request: NextRequest) {
 const token = new URL(request.url).searchParams.get("token") || "";
 const email = await emailForInvite(token).catch(() => null);
 return NextResponse.json({ ok: !!email, email });
}

// POST: set the password from a valid invite token. The token IS the authorization.
export async function POST(request: NextRequest) {
 const body = await request.json().catch(() => null);
 const token = String(body?.token || "");
 const password = String(body?.password || "");
 if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
 const ok = await setPasswordFromInvite(token, password).catch(() => false);
 if (!ok) return NextResponse.json({ error: "This invite link is invalid or has expired." }, { status: 400 });
 return NextResponse.json({ ok: true });
}
