import { neon } from "@neondatabase/serverless";
const db = () => neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
async function main() {
 const one = async (label: string, p: Promise<any>) => {
  try { const r = await p; console.log(`  ${label.padEnd(24)} ${r[0]?.n ?? 0}`); }
  catch { console.log(`  ${label.padEnd(24)} — table missing`); }
 };
 const d = db();
 console.log("=== intake-related row counts ===");
 await one("intake_predictions", d`SELECT COUNT(*)::int AS n FROM intake_predictions`);
 await one("intake_memory_items", d`SELECT COUNT(*)::int AS n FROM intake_memory_items`);
 await one("intake_corrections", d`SELECT COUNT(*)::int AS n FROM intake_corrections`);
 await one("training_examples", d`SELECT COUNT(*)::int AS n FROM training_examples`);
 await one("price_suggestions", d`SELECT COUNT(*)::int AS n FROM price_suggestions`);
 const fields = await d`SELECT field, COUNT(*)::int AS n FROM intake_predictions GROUP BY field ORDER BY n DESC` as any[];
 console.log("\n  predictions by field:", fields.map((f: any) => `${f.field}=${f.n}`).join("  ") || "none");
 const drafts = await d`SELECT COUNT(*)::int AS n FROM api_costs WHERE provider='anthropic' AND operation='draft'` as any[];
 console.log(`\n  AI drafts actually run (since Aug 12): ${drafts[0].n}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
