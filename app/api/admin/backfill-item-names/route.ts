import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

// One-shot backfill: many Collabs-sourced conversions stored a generic line-item
// name ("Item via Shopify Collabs") because Collabs didn't itemize the order. When
// we matched the buyer's click, that click knows the real piece. Copy it into the
// stored items so dashboards and product aggregations show the actual product.
const GENERIC = "Item via Shopify Collabs";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function POST(request: NextRequest) {
 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database" }, { status: 500 });
 const dry = request.nextUrl.searchParams.get("dry") === "1";
 const sql = neon(dbUrl);

 const rows = await sql`
 SELECT conversion_id, items, matched_click_data
 FROM conversions
 WHERE items::text LIKE ${"%" + GENERIC + "%"}
 AND matched_click_data->>'productName' IS NOT NULL
 `;

 const samples: { conversionId: string; from: string; to: string }[] = [];
 let fixed = 0;
 for (const r of rows as any[]) {
 const clickName = r.matched_click_data?.productName;
 if (!clickName || typeof clickName !== "string") continue;
 let items = r.items;
 if (typeof items === "string") { try { items = JSON.parse(items); } catch { continue; } }
 if (!Array.isArray(items)) continue;
 let changed = false;
 const updated = items.map((it: any) => {
 if (it && (!it.productName || it.productName === GENERIC)) { changed = true; return { ...it, productName: clickName }; }
 return it;
 });
 if (!changed) continue;
 if (samples.length < 10) samples.push({ conversionId: r.conversion_id, from: GENERIC, to: clickName });
 if (!dry) await sql`UPDATE conversions SET items = ${JSON.stringify(updated)}::jsonb WHERE conversion_id = ${r.conversion_id}`;
 fixed++;
 }

 return NextResponse.json({ ok: true, dry, scanned: rows.length, fixed, samples });
}
