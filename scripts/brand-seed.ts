import { neon } from "@neondatabase/serverless";
import { inferItemFields, sanitizeStoredBrand } from "../app/lib/infer-item-fields";
const db = () => neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");

// Words that lead a title but are never a label: colours, materials, eras, garments, descriptors.
const STOP = new Set(`vintage the new a an y2k early late mid rare deep long short mini maxi midi
black white blue red green pink gold silver grey gray brown cream beige navy purple orange yellow
tan ivory burgundy olive khaki teal coral lilac mauve charcoal
silk satin leather suede denim wool cotton linen cashmere velvet lace mesh knit tweed nylon
floral polka striped stripe plaid check checked animal leopard zebra cheetah paisley
dress top shirt blouse skirt pants trousers jeans jacket coat blazer bag purse tote clutch
shoes boots heels sandals sneakers belt scarf hat necklace bracelet earrings ring watch
upcycled reworked italian french japanese spanish british american handmade custom original
est set two piece one size os xs sm md lg xl small medium large`.split(/\s+/).filter(Boolean));

const isStop = (w: string) => STOP.has(w.toLowerCase().replace(/[^a-z]/g, ""));

async function main() {
 const rows = await db()`
  SELECT title, designer, store_name, final_price FROM sold_items WHERE final_price > 0
  UNION ALL
  SELECT title, brand AS designer, store_name, price AS final_price FROM products WHERE price > 0
 ` as any[];

 const cand = new Map<string, { n: number; total: number; ex: string }>();
 let unresolved = 0;
 for (const r of rows) {
  const b = sanitizeStoredBrand(r.designer, { title: r.title, storeName: r.store_name }) || inferItemFields(r.title, r.title).brand;
  if (b) continue;
  unresolved++;
  const words = String(r.title || "").split(/\s+/);
  // Take the leading run of Capitalised words, stopping at the first non-label word.
  const run: string[] = [];
  for (const w of words) {
   if (!/^[A-Z][\w&'.é-]*$/.test(w) || isStop(w)) break;
   run.push(w);
   if (run.length === 3) break;
  }
  if (run.length === 0) continue;
  const key = run.join(" ").replace(/[.,]$/, "");
  if (key.length < 3) continue;
  const cur = cand.get(key) || { n: 0, total: 0, ex: r.title };
  cur.n++; cur.total += Number(r.final_price) || 0;
  cand.set(key, cur);
 }

 const list = [...cand.entries()].filter(([, v]) => v.n >= 2).sort((a, b) => b[1].n - a[1].n);
 console.log(`unresolved items: ${unresolved} of ${rows.length}`);
 console.log(`candidate labels (seen 2+ times): ${list.length}\n`);
 console.log("items  avg$   label");
 for (const [k, v] of list.slice(0, 70)) {
  console.log(`${String(v.n).padStart(5)}  ${String(Math.round(v.total / v.n)).padStart(5)}  ${k}`);
 }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
