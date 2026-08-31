import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSetting, saveSetting } from "@/app/lib/settings-db";
import { NEW_ARRIVALS_SUBJECT_KEY, DEFAULT_NEW_ARRIVALS_SUBJECT } from "@/app/lib/email";

// The weekly New Arrivals subject line, editable from /admin/collections so it can change every
// week without a deploy. Stored in app_settings; the cron reads it at send time and falls back to
// DEFAULT_NEW_ARRIVALS_SUBJECT when it has never been set, so an empty setting can never send a blank subject.
const MAX_SUBJECT = 120; // inbox previews truncate long ones anyway; this also bounds the setting

function hashPassword(password: string): string {
 return createHash("sha256").update(password).digest("hex");
}
function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const adminToken = request.cookies.get("via_admin_token")?.value;
 if (adminToken && adminToken === hashPassword(adminPassword)) return true;
 return false;
}

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const stored = await getSetting(NEW_ARRIVALS_SUBJECT_KEY).catch(() => null);
 return NextResponse.json({ subject: stored ?? DEFAULT_NEW_ARRIVALS_SUBJECT, isDefault: !stored });
}

export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = (await request.json().catch(() => null)) as { subject?: unknown } | null;
 const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
 if (!subject) return NextResponse.json({ error: "Subject cannot be empty" }, { status: 400 });
 if (subject.length > MAX_SUBJECT) {
  return NextResponse.json({ error: `Subject must be ${MAX_SUBJECT} characters or fewer` }, { status: 400 });
 }
 await saveSetting(NEW_ARRIVALS_SUBJECT_KEY, subject);
 return NextResponse.json({ ok: true, subject });
}
