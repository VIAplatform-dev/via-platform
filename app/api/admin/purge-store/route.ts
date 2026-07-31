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

/** GET /api/admin/purge-store?slug=kiki-d-design-and-consign — count only, non-destructive */
export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const slug = request.nextUrl.searchParams.get("slug");
 if (!slug) {
 return NextResponse.json({ error: "slug param required" }, { status: 400 });
 }

 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) return NextResponse.json({ error: "No database URL" }, { status: 500 });

 const sql = neon(url);
 const rows = await sql`SELECT COUNT(*)::int AS n FROM products WHERE store_slug = ${slug}`;
 return NextResponse.json({ slug, count: rows[0]?.n ?? 0 });
}

/** DELETE /api/admin/purge-store?slug=kiki-d-design-and-consign */
export async function DELETE(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const slug = request.nextUrl.searchParams.get("slug");
 if (!slug) {
 return NextResponse.json({ error: "slug param required" }, { status: 400 });
 }

 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) return NextResponse.json({ error: "No database URL" }, { status: 500 });

 const sql = neon(url);
 // RETURNING id so result.length is the real deleted-row count — without it Neon
 // returns an empty array for a DELETE and the count always reads 0.
 const result = await sql`
 DELETE FROM products WHERE store_slug = ${slug} RETURNING id
 `;

 return NextResponse.json({ success: true, deleted: result.length ?? 0, slug });
}
