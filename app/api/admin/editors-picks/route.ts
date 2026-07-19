import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createHash } from "crypto";
import {
 getAllEditorsPicks,
 addEditorsPick,
 removeEditorsPick,
 getActiveCollectionSlugs,
} from "@/app/lib/editors-picks-db";

// Curating a collection changes what the marketplace shows — but the homepage is ISR-cached
// (revalidate = 1800). Refresh the affected pages NOW so a newly-populated collection appears
// immediately in the nav / homepage / collection page instead of up to 30 minutes later.
function revalidateMarketplace(slug: string) {
 try {
 revalidatePath("/");
 revalidatePath("/collections");
 revalidatePath(`/collections/${slug}`);
 } catch { /* best-effort */ }
}

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
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 // ?active=true returns the set of collection slugs that have at least one item
 if (request.nextUrl.searchParams.get("active") === "true") {
 try {
 const slugs = await getActiveCollectionSlugs();
 return NextResponse.json({ slugs: Array.from(slugs) });
 } catch (error) {
 return NextResponse.json({ error: "Failed to fetch active slugs" }, { status: 500 });
 }
 }

 const collectionSlug = request.nextUrl.searchParams.get("collection") ?? "editors-picks";

 try {
 const picks = await getAllEditorsPicks(collectionSlug);
 return NextResponse.json({ picks });
 } catch (error) {
 console.error("Failed to fetch picks:", error);
 return NextResponse.json({ error: "Failed to fetch picks" }, { status: 500 });
 }
}

export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 try {
 const { productId, collectionSlug = "editors-picks" } = await request.json();
 if (!productId || typeof productId !== "number") {
 return NextResponse.json({ error: "productId required" }, { status: 400 });
 }
 await addEditorsPick(productId, collectionSlug);
 revalidateMarketplace(collectionSlug);
 return NextResponse.json({ ok: true });
 } catch (error) {
 const msg = error instanceof Error ? error.message : "Failed to add pick";
 return NextResponse.json({ error: msg }, { status: 500 });
 }
}

export async function DELETE(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 try {
 const { productId, collectionSlug = "editors-picks" } = await request.json();
 if (!productId) {
 return NextResponse.json({ error: "productId required" }, { status: 400 });
 }
 await removeEditorsPick(productId, collectionSlug);
 revalidateMarketplace(collectionSlug);
 return NextResponse.json({ ok: true });
 } catch (error) {
 console.error("Failed to remove pick:", error);
 return NextResponse.json({ error: "Failed to remove pick" }, { status: 500 });
 }
}
