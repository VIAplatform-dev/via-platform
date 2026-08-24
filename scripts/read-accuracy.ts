import { getPriceAccuracy } from "../app/lib/eval-price";
const pc = (v: number | null) => (v == null ? "  –" : String(v).padStart(3));
async function main() {
 for (const mode of ["title-ctx", "photo", "title"]) {
  const a = await getPriceAccuracy(120, mode);
  const o = a.overall;
  console.log(`\n### ${mode.toUpperCase()}  (n=${o.n})  verdict=${o.verdict}`);
  console.log(`  within10 ${pc(o.within10Pct)}%   within20 ${pc(o.within20Pct)}%   IN BAND ${pc(o.inBandPct)}% (of ${o.inBandN})`);
  console.log(`  median error ${pc(o.medianErrorPct)}%   median signed ${o.medianSignedPct ?? "–"}%   over ${o.overCount} / under ${o.underCount}`);
  const rows = a.byCategory.filter((c) => c.n >= 4);
  if (rows.length) {
   console.log("  ── by category (n>=4) ──");
   for (const c of rows) console.log(`   ${c.segment.padEnd(16)} n=${String(c.n).padStart(3)}  w20 ${pc(c.within20Pct)}%  band ${pc(c.inBandPct)}%  medErr ${pc(c.medianErrorPct)}%  signed ${String(c.medianSignedPct ?? "–").padStart(5)}%`);
  }
 }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
