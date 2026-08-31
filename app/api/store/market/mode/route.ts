import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getMarketMode, setMarketMode } from "@/app/lib/market/mode-db";

export const dynamic = "force-dynamic";

// GET — is Market Mode on for the acting store?  POST { enabled } — flip it (server-persisted, all devices).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 return NextResponse.json({ enabled: await getMarketMode(slug) });
}

export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => ({}));
 const enabled = Boolean(body?.enabled);
 await setMarketMode(slug, enabled);
 return NextResponse.json({ ok: true, enabled });
}
