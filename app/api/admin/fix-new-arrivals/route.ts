import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { createHash } from "crypto";

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === createHash("sha256").update(adminPassword).digest("hex");
}

/**
 * POST /api/admin/fix-new-arrivals
 *
 * One-time fix: all existing products got their created_at reset to "now"
 * by a previous sync after a created_at wipe. This backdates them all to
 * 30 days ago so only genuinely new products (first synced after this runs)
 * appear in the New Arrivals section.
 *
 * Safe to run multiple times. Subsequent syncs will NOT overwrite created_at
 * since the upsert no longer touches it on conflict.
 */
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
 const body = await request.json().catch(() => ({}));

 // Seed mode: randomly distribute a sample of products across the last 7 days
 if (body?.seed === true) {
 const limit = typeof body.limit === "number" ? body.limit : 200;
 const result = await sql`
 UPDATE products
 SET created_at = NOW() - (RANDOM() * INTERVAL '7 days')
 WHERE id IN (
 SELECT id FROM products ORDER BY RANDOM() LIMIT ${limit}
 )
 RETURNING id
 `;
 return NextResponse.json({
 ok: true,
 updated: result.length,
 message: `Seeded ${result.length} products with created_at spread across the last 7 days.`,
 });
 }

 const result = await sql`
 UPDATE products
 SET created_at = NOW() - INTERVAL '30 days'
 WHERE created_at IS NOT NULL
 RETURNING id
 `;

 return NextResponse.json({
 ok: true,
 updated: result.length,
 message: `Backdated ${result.length} products. Only products synced after now will appear as New Arrivals.`,
 });
}
