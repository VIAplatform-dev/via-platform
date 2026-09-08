import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getNotificationPrefs, setNotificationPrefs } from "@/app/lib/notification-prefs-db";
import type { NotificationPrefsPatch } from "@/app/lib/notification-prefs-core";

export const dynamic = "force-dynamic";

// The store's notification preferences. GET → the whole object (defaults filled in).
// PUT { push?: { sold?: bool, … }, email?: { … } } → only the keys named change; returns the whole.
// Web session or the phone's JWT — the phone's Notifications screen is the main caller.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 return NextResponse.json({ ok: true, prefs: await getNotificationPrefs(slug) });
}

export async function PUT(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = (await request.json().catch(() => null)) as NotificationPrefsPatch | null;
 if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
 return NextResponse.json({ ok: true, prefs: await setNotificationPrefs(slug, body) });
}
