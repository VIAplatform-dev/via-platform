// Read-only: how much do comparable sold pieces vary in price? The ceiling on any pricer's accuracy.
//   npx tsx --env-file=.env.local scripts/noise-floor.ts
import { getNoiseFloor } from "../app/lib/eval-price.ts";

async function main() {
 const r = await getNoiseFloor();
  const line = (s: { segment: string; n: number; groups: number; medianDeviationPct: number; within20Pct: number }) =>
 `${s.segment.padEnd(18)} n=${String(s.n).padStart(4)}  groups=${String(s.groups).padStart(3)}  median spread=${String(s.medianDeviationPct).padStart(3)}%  within20=${String(s.within20Pct).padStart(3)}%`;

  console.log("\n=== NOISE FLOOR — the best any pricer could do on this data ===\n");
  console.log(r.overall ? line(r.overall) : "no comparable groups found");
  console.log("\n--- by category ---");
  for (const c of r.byCategory.slice(0, 12))   console.log(line(c));
  console.log(`\n${r.note}\n`);
}
main();
