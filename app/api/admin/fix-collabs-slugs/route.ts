import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { stores } from "@/app/lib/stores";

function hashPassword(password: string): string {
 const crypto = require("crypto");
 return crypto.createHash("sha256").update(password).digest("hex");
}
function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return token === hashPassword(adminPassword);
}

const storeNameToSlug = new Map<string, string>(
 stores.map((s) => [s.name.toLowerCase(), s.slug])
);
const slugByNormalized = new Map<string, string>(
 stores.map((s) => [s.slug.replace(/-/g, ""), s.slug])
);
const collabsHandleOverrides: Record<string, string> = {
 "source 24": "source-twenty-four",
 "chill boutique consignment": "chill-boutique",
 "chillboutiqueconsignment": "chill-boutique",
};

function resolveStoreSlug(brandName: string): string | null {
 // Strip leading/trailing punctuation (e.g. "Dear Muse," → "dear muse")
 const key = brandName.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "").trim();
 if (storeNameToSlug.has(key)) return storeNameToSlug.get(key)!;
 if (collabsHandleOverrides[key]) return collabsHandleOverrides[key];
 const normalized = key.replace(/[^a-z0-9]/g, "");
 if (slugByNormalized.has(normalized)) return slugByNormalized.get(normalized)!;
 return null; // Can't resolve: don't touch it
}

/**
 * POST /api/admin/fix-collabs-slugs
 *
 * Finds conversions saved with bad store_slug (from old resolveStoreSlug fallback)
 * and re-maps them to the correct slug using the improved lookup.
 * Safe to run multiple times.
 */
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No DB URL" }, { status: 500 });
 const sql = neon(dbUrl);

 // Fetch all conversions whose store_slug doesn't match any known VYA slug
 const knownSlugs = stores.map((s) => s.slug);
 const rows = await sql`
 SELECT id, store_slug, store_name
 FROM conversions
 WHERE store_slug NOT IN (SELECT unnest(${knownSlugs}::text[]))
 `;

 let fixed = 0;
 let unresolvable: string[] = [];

 for (const row of rows) {
 const correctSlug = resolveStoreSlug(row.store_name as string);
 if (!correctSlug) {
 unresolvable.push(row.store_name as string);
 continue;
 }

 const correctStore = stores.find((s) => s.slug === correctSlug);
 const correctName = correctStore?.name ?? (row.store_name as string);

 await sql`
 UPDATE conversions
 SET store_slug = ${correctSlug}, store_name = ${correctName}
 WHERE id = ${row.id as number}
 `;
 fixed++;
 }

 return NextResponse.json({
 ok: true,
 fixed,
 unresolvable: [...new Set(unresolvable)],
 total: rows.length,
 });
}
