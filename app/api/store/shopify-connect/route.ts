import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { verifyConnection } from "@/app/lib/shopify-storefront";
import { saveConnection, getConnection, deleteConnection } from "@/app/lib/shopify-connect-db";

export const dynamic = "force-dynamic";

// GET: connection status for the acting store.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const conn = await getConnection(slug).catch(() => null);
 return NextResponse.json({ connected: !!conn, shopDomain: conn?.shopDomain ?? null, shopName: conn?.shopName ?? null });
}

// POST { shopDomain, token }: verify the token, then save the connection.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const shopDomain = body?.shopDomain ? String(body.shopDomain).trim() : "";
 const token = body?.token ? String(body.token).trim() : "";
 if (!shopDomain || !token) return NextResponse.json({ error: "Shop domain and token are required." }, { status: 400 });

 const result = await verifyConnection(shopDomain, token);
 if (!result.ok) return NextResponse.json({ error: result.error || "Couldn’t connect: check the domain and token." }, { status: 400 });

 await saveConnection(slug, shopDomain, token, result.shopName ?? null);
 return NextResponse.json({ ok: true, shopName: result.shopName ?? null });
}

// DELETE: disconnect.
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 await deleteConnection(slug).catch(() => {});
 return NextResponse.json({ ok: true });
}
