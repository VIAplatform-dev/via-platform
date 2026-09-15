import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

/**
 * POST /api/admin/reset-created-at
 *
 * One-time wipe: marks all existing products as insider_notified = TRUE
 * so they don't appear on the Insider page or trigger another email blast.
 * Safe to run multiple times.
 */
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");

 // Create the tracking table if it doesn't exist yet
 await sql`
 CREATE TABLE IF NOT EXISTS insider_seen_products (
 store_slug TEXT NOT NULL,
 title TEXT NOT NULL,
 PRIMARY KEY (store_slug, title)
 )
 `;

 const result = await sql`
 UPDATE products
 SET insider_notified = TRUE, created_at = NULL
 RETURNING id, store_slug, title
 `;

 // Persist all as "seen" so re-inserted products stay off the Insider page
 if (result.length > 0) {
 for (const row of result) {
 await sql`
 INSERT INTO insider_seen_products (store_slug, title)
 VALUES (${row.store_slug}, ${row.title})
 ON CONFLICT DO NOTHING
 `;
 }
 }

 return NextResponse.json({
 ok: true,
 message: `Reset ${result.length} products. All are now live for everyone, insider page is empty. Only brand-new products from future syncs will appear on insider.`,
 count: result.length,
 });
}
