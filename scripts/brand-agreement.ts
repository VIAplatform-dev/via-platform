/**
 * What each identification path says about the SAME photo, side by side.
 *
 * The screenshots that prompted this showed one dress simultaneously labelled Dior (brand field),
 * Sue Wong (title) and Prada (visual match). Three paths each produce a brand and nothing reconciles
 * them — intake/route.ts:237 already DETECTS the disagreement and computes a low confidence, then
 * writes a brand in anyway, because nothing downstream reads that number.
 *
 * This runs the same paths outside the API (no login, no UI) so the disagreement is visible and
 * measurable before any of it is changed.
 *
 * Run: npx tsx --env-file=<env> scripts/brand-agreement.ts [n]
 */
import { neon } from "@neondatabase/serverless";
import { aiIntake } from "../app/lib/ai-intake.ts";
import { reverseImageMatches } from "../app/lib/comps.ts";
import { inferBrandFromTitle } from "../app/lib/market-data-db.ts";

const N = Number(process.argv[2] || 5);

/** Same consensus the intake route computes from Lens matches (brandFromMatches). */
function lensConsensus(titles: string[]): { brand: string | null; hits: number; total: number } {
 const tally = new Map<string, number>();
 for (const t of titles) {
  const b = inferBrandFromTitle(t);
  if (b) tally.set(b, (tally.get(b) || 0) + 1);
 }
 let brand: string | null = null, hits = 0;
 for (const [b, n] of tally) if (n > hits) { brand = b; hits = n; }
 return { brand, hits, total: titles.length };
}

const eq = (a: string | null, b: string | null) =>
 !!a && !!b && a.toLowerCase().replace(/[^a-z]/g, "") === b.toLowerCase().replace(/[^a-z]/g, "");

async function main() {
 const sql = neon(process.env.DATABASE_URL!);
 // Items already graded, so there is a known right answer to compare against.
 const rows = (await sql`
  SELECT s.id, s.title, s.image, s.designer, s.final_price, p.brand AS eval_brand, p.signed_error_pct
  FROM sold_items s JOIN price_eval_items p ON p.sold_id = s.id
  WHERE p.mode='title-ctx' AND s.image IS NOT NULL AND s.image <> ''
  ORDER BY random() LIMIT ${N}
 `) as Array<Record<string, string | number | null>>;

 let agree = 0, disagree = 0, noSignal = 0;

 for (const r of rows) {
  const title = String(r.title || "");
  const image = String(r.image || "");
  console.log(`\n${"─".repeat(78)}\n${title.slice(0, 74)}`);
  console.log(`  sold $${(Number(r.final_price)).toFixed(0)}   truth from title: ${inferBrandFromTitle(title) || "(brand not in map)"}`);

  // 1. Vision — the model looking at the photos, with its own confidence.
  const ai = await aiIntake({ imageUrls: [image] }).catch((e) => { console.log("  vision failed:", String(e).slice(0, 60)); return null; });
  const visionBrand = (ai?.brand?.value as string | null) ?? null;
  const visionConf = (ai?.brand?.confidence as number | null) ?? null;

  // 2. Reverse image — the deterministic consensus across visual matches.
  const matches = await reverseImageMatches(image).catch(() => []);
  const lens = lensConsensus(matches.map((m) => String(m.title || "")));

  // 3. The care tag, verbatim — where an RN would be if there is one.
  const careTag = (ai?.careTag as string | null) ?? null;
  const rn = careTag ? (careTag.match(/\bR\.?N\.?#?\s*(\d{4,6})\b/i)?.[1] ?? null) : null;

  console.log(`  vision:      ${String(visionBrand ?? "(null)").padEnd(22)} confidence ${visionConf ?? "–"}`);
  console.log(`  lens:        ${String(lens.brand ?? "(null)").padEnd(22)} ${lens.hits}/${lens.total} matches agree`);
  console.log(`  care tag RN: ${rn ?? "(none legible)"}`);

  if (!visionBrand && !lens.brand) { noSignal++; console.log(`  → NO SIGNAL — should ask the seller`); }
  else if (eq(visionBrand, lens.brand)) { agree++; console.log(`  → AGREE — safe to use, ask nothing`); }
  else { disagree++; console.log(`  → DISAGREE (${visionBrand ?? "null"} vs ${lens.brand ?? "null"}) — should ask, currently states one anyway`); }
 }

 const n = rows.length;
 console.log(`\n${"═".repeat(78)}`);
 console.log(`agree: ${agree}/${n}   disagree: ${disagree}/${n}   no signal: ${noSignal}/${n}`);
 console.log(`items where a question SHOULD fire: ${disagree + noSignal}/${n}`);
 console.log(`\nToday every one of these produces a confident brand in the field regardless.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
