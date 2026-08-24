import { neon } from "@neondatabase/serverless";
import { inferItemFields, sanitizeStoredBrand } from "../app/lib/infer-item-fields";
const db = () => neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");

async function main() {
 const rows = await db()`
  SELECT title, designer, store_name, final_price FROM sold_items WHERE final_price > 0
  UNION ALL
  SELECT title, brand AS designer, store_name, price AS final_price FROM products WHERE price > 0
 ` as any[];
 let resolved = 0, unresolved = 0;
 const missing = new Map<string, { n: number; total: number; ex: string }>();
 for (const r of rows) {
  const b = sanitizeStoredBrand(r.designer, { title: r.title, storeName: r.store_name }) || inferItemFields(r.title, r.title).brand;
  if (b) { resolved++; continue; }
  unresolved++;
  // First 1-3 capitalised words of the title are the usual place a niche label hides.
  const m = String(r.title || "").match(/^([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,2})/);
  const guess = (m?.[1] || "").trim();
  if (!guess || guess.length < 3 || /^(Vintage|The|New|Y2K|A|An|Black|White|Blue|Red|Green|Pink|Gold|Silver|Deep|Long|Short|Mini|Maxi|Midi)\b/i.test(guess)) continue;
  const cur = missing.get(guess) || { n: 0, total: 0, ex: r.title };
  cur.n++; cur.total += Number(r.final_price) || 0;
  missing.set(guess, cur);
 }
 console.log(`rows: ${rows.length}   brand resolved: ${resolved}   UNRESOLVED: ${unresolved} (${Math.round((unresolved/rows.length)*100)}%)\n`);
 console.log("=== most frequent unrecognised label candidates ===");
 console.log("count  avg$   candidate");
 for (const [k, v] of [...missing.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 40)) {
  console.log(`${String(v.n).padStart(5)}  ${String(Math.round(v.total / v.n)).padStart(5)}  ${k}`);
 }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
