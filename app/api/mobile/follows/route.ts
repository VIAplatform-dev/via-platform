import { NextResponse } from "next/server";
import { setFollows, getFollows } from "@/app/lib/store-follows-db";

export const dynamic = "force-dynamic";

/** GET /api/mobile/follows?deviceId=... the device's followed store slugs. */
export async function GET(request: Request) {
 const { searchParams } = new URL(request.url);
 const deviceId = searchParams.get("deviceId");
 if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });
 try {
 const stores = await getFollows(deviceId);
 return NextResponse.json({ stores });
 } catch {
 return NextResponse.json({ stores: [] });
 }
}

/** POST /api/mobile/follows. Replace a device's followed stores.
 * Body: { deviceId, pushToken?, stores: string[] }. The push token lets the
 * notify-follows cron alert this device when a followed store drops new arrivals. */
export async function POST(request: Request) {
 const body = await request.json().catch(() => ({}));
 const deviceId = typeof body?.deviceId === "string" ? body.deviceId : null;
 const pushToken = typeof body?.pushToken === "string" ? body.pushToken : null;
 const stores = Array.isArray(body?.stores) ? body.stores.filter((s: unknown): s is string => typeof s === "string") : [];
 if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });
 try {
 await setFollows(deviceId, pushToken, stores);
 return NextResponse.json({ ok: true, stores });
 } catch (err) {
 return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
 }
}
