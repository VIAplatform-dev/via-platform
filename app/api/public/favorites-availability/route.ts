import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

// POST /api/public/favorites-availability
// Body: { ids: string[] }: composite product ids ("store-slug-123").
// Returns { available: string[] }: the subset still in the catalog. Anything a
// shopper favorited that ISN'T returned has sold out / been delisted (vintage is
// one-of-one, so a removed listing means it's gone). On error, `available` is null
// so the app can fail safe (treat everything as still available, grey out nothing).
export async function POST(request: Request) {
 try {
 const body = await request.json().catch(() => ({}));
 const ids: string[] = Array.isArray(body?.ids)
  ? body.ids.filter((x: unknown): x is string => typeof x === "string").slice(0, 500)
  : [];
 if (ids.length === 0) return NextResponse.json({ available: [] });

 const sql = db();
 const rows = (await sql`
  SELECT (store_slug || '-' || id::text) AS composite
  FROM products
  WHERE (store_slug || '-' || id::text) = ANY(${ids}::text[])
 `) as Array<{ composite: string }>;

 return NextResponse.json({ available: rows.map((r) => r.composite) });
 } catch (err) {
 console.error("[favorites-availability] error:", err);
 return NextResponse.json({ available: null });
 }
}
