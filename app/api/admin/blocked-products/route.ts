import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { listBlockedProducts, blockProduct, unblockProduct } from "@/app/lib/blocked-products-db";

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 if (request.headers.get("authorization") === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return token === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

// GET: list everything currently blocked
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const blocked = await listBlockedProducts();
 return NextResponse.json({ blocked });
}

// POST { storeSlug, title, reason? }: permanently remove a product (delete now + block re-import)
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => ({}));
 const storeSlug = (body.storeSlug ?? "").toString().trim();
 const title = (body.title ?? "").toString().trim();
 const reason = body.reason ? body.reason.toString().trim() : null;
 if (!storeSlug || !title) {
 return NextResponse.json({ error: "storeSlug and title are required" }, { status: 400 });
 }
 const { deleted } = await blockProduct(storeSlug, title, reason);
 return NextResponse.json({ ok: true, deleted });
}

// DELETE ?store=&title= restore (stop blocking)
export async function DELETE(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const storeSlug = request.nextUrl.searchParams.get("store");
 const title = request.nextUrl.searchParams.get("title");
 if (!storeSlug || !title) {
 return NextResponse.json({ error: "store and title are required" }, { status: 400 });
 }
 await unblockProduct(storeSlug, title);
 return NextResponse.json({ ok: true });
}
