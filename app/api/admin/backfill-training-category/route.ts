import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";
import { normalizeCategory } from "@/app/lib/market-data-db";

// Backfill training_examples.category from each example's title using VYA's canonical
// normalizeCategory(), so the nightly intake-accuracy exam has a real answer key for category
// (it was blank on the ~4,485 marketplace-backfilled rows, forcing category to show n/a).
// Dry-run by default; ?apply=1 writes. Grouped by resulting category → ~20 UPDATEs, not thousands.

export const maxDuration = 120;

function isAuthorized(request: NextRequest): boolean {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) return false;
 if (request.headers.get("authorization") === `Bearer ${pw}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(pw).digest("hex");
}

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const apply = new URL(request.url).searchParams.get("apply") === "1";
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) return NextResponse.json({ error: "No DB" }, { status: 500 });
 const sql = neon(url);

 const rows = (await sql`
  SELECT id, title FROM training_examples
  WHERE (category IS NULL OR category = '') AND title IS NOT NULL AND title <> ''
 `.catch(() => [])) as { id: number; title: string }[];

 // Group the ids by the category inferred from their title.
 const byCat = new Map<string, number[]>();
 let unresolved = 0;
 for (const r of rows) {
 const cat = normalizeCategory(r.title);
 if (!cat) { unresolved++; continue; }
 (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(r.id);
 }
 const breakdown = Object.fromEntries([...byCat.entries()].map(([c, ids]) => [c, ids.length]).sort((a, b) => (b[1] as number) - (a[1] as number)));

 if (!apply) {
 return NextResponse.json({
 dryRun: true,
 examplesMissingCategory: rows.length,
 wouldBackfill: rows.length - unresolved,
 unresolvableFromTitle: unresolved,
 byCategory: breakdown,
 note: "Re-run with ?apply=1 to write. Category is inferred from the title via VYA's canonical normalizeCategory().",
 });
 }

 let updated = 0;
 for (const [cat, ids] of byCat) {
 for (let i = 0; i < ids.length; i += 500) {
 const chunk = ids.slice(i, i + 500);
 await sql`UPDATE training_examples SET category = ${cat} WHERE id = ANY(${chunk})`.catch(() => {});
 updated += chunk.length;
 }
 }
 return NextResponse.json({ ok: true, updated, unresolvableFromTitle: unresolved, byCategory: breakdown });
}
