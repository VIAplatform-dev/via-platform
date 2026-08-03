import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

function hashPassword(password: string): string {
 const crypto = require("crypto");
 return crypto.createHash("sha256").update(password).digest("hex");
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

// Tables with a direct store_slug column — deleted by WHERE store_slug = slug.
const STORE_SLUG_TABLES = [
 "products",
 "price_history",
 "sold_items",
 "product_history",
 "insider_seen_products",
 "clicks",
 "conversions",
 "suppressed_conversions",
 "store_favorites",
] as const;

type SqlClient = ReturnType<typeof neon>;

function getSql(): SqlClient | null {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) return null;
 return neon(url);
}

// Count rows a purge would touch, per table. Non-destructive.
async function countRows(sql: SqlClient, slug: string) {
 const counts: Record<string, number> = {};

 // The product ids (numeric) and composite keys used by product-keyed tables.
 const idRows = (await sql`SELECT id FROM products WHERE store_slug = ${slug}`) as { id: number }[];
 const numericIds = idRows.map((r) => r.id);
 const compositeIds = numericIds.map((id) => `${slug}-${id}`);

 for (const table of STORE_SLUG_TABLES) {
 try {
 // Identifiers can't be parameterized in tagged templates — build per table.
 const rows = (await sql.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE store_slug = $1`, [slug])) as { n: number }[];
 counts[table] = rows[0]?.n ?? 0;
 } catch {
 counts[table] = -1; // table missing / schema mismatch — skip, don't abort
 }
 }

 // product_favorites: keyed by numeric products.id
 try {
 const rows = numericIds.length
 ? ((await sql.query(`SELECT COUNT(*)::int AS n FROM product_favorites WHERE product_id = ANY($1)`, [numericIds])) as { n: number }[])
 : [{ n: 0 }];
 counts["product_favorites"] = rows[0]?.n ?? 0;
 } catch {
 counts["product_favorites"] = -1;
 }

 // product_views: keyed by composite "slug-id" string
 try {
 const rows = compositeIds.length
 ? ((await sql.query(`SELECT COUNT(*)::int AS n FROM product_views WHERE product_id = ANY($1)`, [compositeIds])) as { n: number }[])
 : [{ n: 0 }];
 counts["product_views"] = rows[0]?.n ?? 0;
 } catch {
 counts["product_views"] = -1;
 }

 return { counts, productCount: numericIds.length };
}

/**
 * GET /api/admin/purge-store?slug=venus-vintage
 * Non-destructive preview: row counts across every store-referencing table.
 */
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 const slug = request.nextUrl.searchParams.get("slug");
 if (!slug) return NextResponse.json({ error: "slug param required" }, { status: 400 });

 const sql = getSql();
 if (!sql) return NextResponse.json({ error: "No database URL" }, { status: 500 });

 const { counts, productCount } = await countRows(sql, slug);
 return NextResponse.json({ slug, productCount, counts, note: "Preview only. Use DELETE to execute." });
}

/**
 * DELETE /api/admin/purge-store?slug=venus-vintage
 * Permanently removes the store's rows from products + all analytics/favorites tables.
 */
export async function DELETE(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 const slug = request.nextUrl.searchParams.get("slug");
 if (!slug) return NextResponse.json({ error: "slug param required" }, { status: 400 });

 const sql = getSql();
 if (!sql) return NextResponse.json({ error: "No database URL" }, { status: 500 });

 // Capture product ids BEFORE deleting products (product-keyed tables need them).
 const idRows = (await sql`SELECT id FROM products WHERE store_slug = ${slug}`) as { id: number }[];
 const numericIds = idRows.map((r) => r.id);
 const compositeIds = numericIds.map((id) => `${slug}-${id}`);

 const deleted: Record<string, number> = {};

 // Product-keyed tables first (they reference product ids we're about to remove).
 if (numericIds.length) {
 try {
 const r = (await sql.query(`DELETE FROM product_favorites WHERE product_id = ANY($1) RETURNING id`, [numericIds])) as unknown[];
 deleted["product_favorites"] = r.length;
 } catch { deleted["product_favorites"] = -1; }
 } else {
 deleted["product_favorites"] = 0;
 }

 if (compositeIds.length) {
 try {
 const r = (await sql.query(`DELETE FROM product_views WHERE product_id = ANY($1) RETURNING id`, [compositeIds])) as unknown[];
 deleted["product_views"] = r.length;
 } catch { deleted["product_views"] = -1; }
 } else {
 deleted["product_views"] = 0;
 }

 // Direct store_slug tables.
 for (const table of STORE_SLUG_TABLES) {
 try {
 const r = (await sql.query(`DELETE FROM ${table} WHERE store_slug = $1 RETURNING store_slug`, [slug])) as unknown[];
 deleted[table] = r.length;
 } catch {
 deleted[table] = -1; // table missing / no RETURNING-able col — skip
 }
 }

 const totalDeleted = Object.values(deleted).reduce((a, b) => a + (b > 0 ? b : 0), 0);
 return NextResponse.json({ success: true, slug, productsDeleted: deleted["products"] ?? 0, totalDeleted, deleted });
}
