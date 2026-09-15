import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const adminToken = request.cookies.get("via_admin_token")?.value;
 if (adminToken && adminToken === crypto.createHash("sha256").update(adminPassword).digest("hex")) return true;
 return false;
}

export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });
 const sql = neon(dbUrl);

 try {
 await sql`ALTER TABLE sold_items ADD COLUMN IF NOT EXISTS source_id TEXT`;

 // Clear previous backfill rows
 await sql`DELETE FROM sold_items WHERE source_id LIKE 'conv_%'`;

 // Insert from conversions. Skip generic Shopify Collabs order names
 const result = await sql`
 INSERT INTO sold_items (store_slug, store_name, product_id, title, final_price, currency, sold_at, source_id)
 SELECT
 c.store_slug,
 c.store_name,
 item->>'productId',
 item->>'productName',
 (item->>'price')::numeric,
 COALESCE(c.currency, 'USD'),
 c.timestamp,
 'conv_' || c.conversion_id || '_' || idx
 FROM conversions c,
 LATERAL jsonb_array_elements(c.items) WITH ORDINALITY AS t(item, idx)
 WHERE c.order_total > 0
 AND (c.returned IS NULL OR c.returned = false)
 AND c.items IS NOT NULL
 AND jsonb_array_length(c.items) > 0
 AND (item->>'productName') IS NOT NULL
 AND (item->>'productName') != ''
 AND (item->>'price') IS NOT NULL
 AND (item->>'price')::numeric > 0
 AND (item->>'productName') NOT ILIKE '%shopify collabs%'
 AND (item->>'productName') NOT ILIKE '%order via%'
 AND (item->>'productName') NOT ILIKE '% order%'
 AND LENGTH(item->>'productName') > 3
 `;

 // Enrich designer for backfill rows. Prefer brand (vendor = designer) over product_type (category)
 await sql`
 UPDATE sold_items si
 SET designer = COALESCE(NULLIF(p.brand, ''), NULLIF(p.product_type, ''))
 FROM products p
 WHERE si.source_id LIKE 'conv_%'
 AND si.designer IS NULL
 AND COALESCE(NULLIF(p.brand, ''), NULLIF(p.product_type, '')) IS NOT NULL
 AND LOWER(TRIM(si.title)) = LOWER(TRIM(p.title))
 AND si.store_slug = p.store_slug
 `;

 // Also enrich any existing sold_items (from feed drops) that are missing designer
 await sql`
 UPDATE sold_items si
 SET designer = COALESCE(NULLIF(p.brand, ''), NULLIF(p.product_type, ''))
 FROM products p
 WHERE (si.source_id IS NULL OR si.source_id NOT LIKE 'conv_%')
 AND si.designer IS NULL
 AND COALESCE(NULLIF(p.brand, ''), NULLIF(p.product_type, '')) IS NOT NULL
 AND LOWER(TRIM(si.title)) = LOWER(TRIM(p.title))
 AND si.store_slug = p.store_slug
 `;

 return NextResponse.json({ ok: true, inserted: result.length ?? 0 });
 } catch (err: unknown) {
 const message = err instanceof Error ? err.message : String(err);
 return NextResponse.json({ error: message }, { status: 500 });
 }
}
