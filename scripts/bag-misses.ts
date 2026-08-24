import { neon } from "@neondatabase/serverless";
const db = () => neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
async function main() {
 const rows = await db()`
  SELECT p.brand, p.sold_cents, p.pred_cents, p.signed_error_pct, p.low_cents, p.high_cents, s.title
  FROM price_eval_items p LEFT JOIN sold_items s ON s.id = p.sold_id
  WHERE p.mode = 'title-ctx' AND p.category = 'Bags' AND p.pred_cents IS NOT NULL
  ORDER BY p.signed_error_pct ASC` as any[];
 console.log(`\nBAGS — ${rows.length} graded\n`);
 console.log("sold    pred    band            signed  brand / title");
 for (const r of rows) {
  const usd = (c: any) => (c == null ? "  –" : `$${Math.round(Number(c) / 100)}`);
  console.log(
   `${usd(r.sold_cents).padEnd(8)}${usd(r.pred_cents).padEnd(8)}${(usd(r.low_cents) + "–" + usd(r.high_cents)).padEnd(16)}${String(r.signed_error_pct ?? "–").padStart(5)}%  ${(r.brand || "—")} / ${String(r.title || "").slice(0, 52)}`,
  );
 }
 const under = rows.filter((r) => (r.signed_error_pct ?? 0) < 0).length;
 console.log(`\nunder-priced: ${under} / ${rows.length}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
