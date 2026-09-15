import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getPlatform, PLATFORMS } from "@/app/lib/platforms";
import { saveConnection, getConnection, deleteConnection } from "@/app/lib/store-connections-db";

export const dynamic = "force-dynamic";

// GET: current connection + the list of connectable platforms (for the UI).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const conn = await getConnection(slug).catch(() => null);
 return NextResponse.json({
 connected: !!conn,
 platform: conn?.platform ?? null,
 label: conn?.label ?? null,
 platforms: PLATFORMS.map((p) => ({ id: p.id, name: p.name, fields: p.fields })),
 });
}

// POST { platform, credentials }: verify via the platform adapter, then save.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const platformId = String(body?.platform || "");
 const credentials = body?.credentials && typeof body.credentials === "object" ? (body.credentials as Record<string, string>) : {};
 const adapter = getPlatform(platformId);
 if (!adapter) return NextResponse.json({ error: "Unsupported platform." }, { status: 400 });

 const result = await adapter.verify(credentials);
 if (!result.ok) return NextResponse.json({ error: result.error || "Couldn’t connect: check your credentials." }, { status: 400 });

 await saveConnection(slug, platformId, credentials, result.label ?? null);
 return NextResponse.json({ ok: true, platform: platformId, label: result.label ?? null });
}

// DELETE: disconnect.
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 await deleteConnection(slug).catch(() => {});
 return NextResponse.json({ ok: true });
}
