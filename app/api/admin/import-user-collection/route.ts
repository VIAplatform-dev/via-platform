import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { neon } from "@neondatabase/serverless";
import { getUserCollections, getCollectionItems } from "@/app/lib/user-collections-db";
import { addEditorsPick } from "@/app/lib/editors-picks-db";
import { COLLECTIONS } from "@/app/lib/collections-config";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}
function hashPassword(password: string): string {
 return crypto.createHash("sha256").update(password).digest("hex");
}
function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === hashPassword(adminPassword);
}

// GET /api/admin/import-user-collection?email=... list a user's personal
// collections (id, name, itemCount) so the admin UI can pick which to import.
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const email = request.nextUrl.searchParams.get("email")?.trim();
 if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

 const sql = db();
 const userRows = (await sql`SELECT id FROM users WHERE lower(email) = lower(${email}) LIMIT 1`) as Array<{ id: string }>;
 if (userRows.length === 0) return NextResponse.json({ error: `No user found for ${email}` }, { status: 404 });

 const collections = await getUserCollections(userRows[0].id);
 return NextResponse.json({ collections: collections.map((c) => ({ id: c.id, name: c.name, itemCount: c.itemCount })) });
}

// POST /api/admin/import-user-collection
// body: { email, targetSlug, match?, sourceCollectionId? }
//
// Copies the products from a user's personal collection (user_collection_items)
// into an editorial VYA collection (editors_picks under targetSlug). Idempotent
// re-running just skips items already added.
//
// If the user has several collections and `match`/`sourceCollectionId` don't
// pin one down, it returns the list so you can pick the right id.
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 let body: { email?: string; targetSlug?: string; match?: string; sourceCollectionId?: number };
 try {
 body = await request.json();
 } catch {
 return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
 }
 const { email, targetSlug, match, sourceCollectionId } = body;
 if (!email || !targetSlug) {
 return NextResponse.json({ error: "email and targetSlug are required" }, { status: 400 });
 }
 if (!COLLECTIONS.some((c) => c.slug === targetSlug)) {
 return NextResponse.json({ error: `Unknown targetSlug "${targetSlug}". Add it to collections-config first.` }, { status: 400 });
 }

 const sql = db();

 // Resolve the user by email.
 const userRows = (await sql`SELECT id, email FROM users WHERE lower(email) = lower(${email}) LIMIT 1`) as Array<{ id: string; email: string }>;
 if (userRows.length === 0) {
 return NextResponse.json({ error: `No user found for ${email}` }, { status: 404 });
 }
 const userId = userRows[0].id;

 // Find the source collection.
 const collections = await getUserCollections(userId);
 if (collections.length === 0) {
 return NextResponse.json({ error: `${email} has no collections.` }, { status: 404 });
 }
 let source = sourceCollectionId
 ? collections.find((c) => c.id === sourceCollectionId)
 : match
 ? collections.filter((c) => c.name.toLowerCase().includes(match.toLowerCase()))
 : collections;

 // Disambiguate: if more than one candidate, return the list to choose from.
 if (Array.isArray(source)) {
 if (source.length === 1) source = source[0];
 else
 return NextResponse.json({
  needsChoice: true,
  message: "Multiple collections matched. Re-call with sourceCollectionId.",
  collections: source.map((c) => ({ id: c.id, name: c.name, itemCount: c.itemCount })),
 });
 }
 if (!source) {
 return NextResponse.json({ error: "No matching collection. Provide a valid sourceCollectionId.", collections: collections.map((c) => ({ id: c.id, name: c.name, itemCount: c.itemCount })) }, { status: 404 });
 }

 // Pull its items, keeping only products that still exist in the catalog.
 const items = await getCollectionItems(source.id);
 const productIds = items.map((i) => i.productId);
 if (productIds.length === 0) {
 return NextResponse.json({ ok: true, source: { id: source.id, name: source.name }, found: 0, added: 0, missing: 0 });
 }
 const existingRows = (await sql`SELECT id FROM products WHERE id = ANY(${productIds})`) as Array<{ id: number }>;
 const existing = new Set(existingRows.map((r) => r.id));

 let added = 0;
 for (const pid of productIds) {
 if (!existing.has(pid)) continue;
 await addEditorsPick(pid, targetSlug); // idempotent
 added++;
 }

 return NextResponse.json({
 ok: true,
 source: { id: source.id, name: source.name },
 targetSlug,
 found: productIds.length,
 added,
 missing: productIds.length - existing.size,
 });
}
