// Run the price eval directly — no server, no admin auth. Same DB + API keys as the
// deployed endpoint (load them with --env-file):
//   npx tsx --env-file=.env.local scripts/run-price-eval.ts --mode title-ctx --sample 40
//   npx tsx --env-file=.env.local scripts/run-price-eval.ts --compare
import { runPriceEval, getPriceAccuracy, comparePriceAccuracy } from "../app/lib/eval-price";

function arg(name: string): string | null {
 const i = process.argv.indexOf(`--${name}`);
 return i >= 0 ? process.argv[i + 1] ?? "" : null;
}

async function main() {
 if (process.argv.includes("--compare")) {
 console.log(JSON.stringify(await comparePriceAccuracy(120), null, 1));
 return;
 }
 const mode = arg("mode") ?? "title";
 const sample = Number(arg("sample")) || 12;
 const run = await runPriceEval({ sample, photoOnly: mode === "photo", withContext: mode === "title-ctx" });
 console.log(JSON.stringify({ run, accuracy: await getPriceAccuracy(120, mode) }, null, 1));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
