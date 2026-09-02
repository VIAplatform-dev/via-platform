/**
 * Manage the printed QR codes. The codes live in Neon, so repointing one takes effect on the
 * next scan with no deploy — the printed card keeps working and simply leads somewhere else.
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/qr-codes.mts list
 *   node --env-file=.env.local --experimental-strip-types scripts/qr-codes.mts set fendi-ny https://vyaplatform.com/brands/fendi/newyork "Fendi / New York"
 *   node --env-file=.env.local --experimental-strip-types scripts/qr-codes.mts off fendi-ny
 *   node --env-file=.env.local --experimental-strip-types scripts/qr-codes.mts seed
 *
 * A destination must be https on getvya.ai or vyaplatform.com. Anything else is refused here
 * rather than at scan time, so a bad URL never reaches the table.
 */
import { listQrCodes, setQrCode, deactivateQrCode } from "../app/lib/qr-codes-db.ts";
import { qrTargetUrl } from "../app/lib/qr-codes.ts";

// The two codes this campaign needs. `seed` is idempotent — it repoints rather than duplicates.
const SEED: [code: string, destination: string, label: string][] = [
 ["getvya", "https://getvya.ai/", "VYA — main landing page"],
 ["fendi-ny", "https://vyaplatform.com/brands/fendi/newyork", "Fendi / New York"],
];

const [command, ...rest] = process.argv.slice(2);

async function show() {
 const codes = await listQrCodes();
 if (!codes.length) {
  console.log("No codes yet. Run `seed` to create the two for this campaign.");
  return;
 }
 for (const c of codes) {
  console.log(`${c.active ? " " : "×"} ${c.code}  ${c.label}`);
  console.log(`    scan ${qrTargetUrl(c.code)}`);
  console.log(`    →    ${c.destination}`);
 }
 console.log(`\n${codes.filter((c) => c.active).length} active, ${codes.length} total.`);
}

switch (command) {
 case "list":
 case undefined:
  await show();
  break;

 case "set": {
  const [code, destination, ...labelParts] = rest;
  if (!code || !destination) {
   console.error('Usage: set <code> <https://…> "Label"');
   process.exit(1);
  }
  const row = await setQrCode(code, destination, labelParts.join(" ") || code);
  console.log(`${row.code} → ${row.destination}`);
  console.log(`Regenerate the image: node --experimental-strip-types scripts/make-qr.mts ${row.code}`);
  break;
 }

 case "off": {
  const [code] = rest;
  if (!code) {
   console.error("Usage: off <code>");
   process.exit(1);
  }
  const ok = await deactivateQrCode(code);
  // The row is kept, not deleted, so its scans keep their label and history.
  console.log(ok ? `${code} retired — scans now fall back to the homepage.` : `No such code: ${code}`);
  break;
 }

 case "seed":
  for (const [code, destination, label] of SEED) {
   const row = await setQrCode(code, destination, label);
   console.log(`${row.code} → ${row.destination}`);
  }
  break;

 default:
  console.error(`Unknown command: ${command}. Try list, set, off, seed.`);
  process.exit(1);
}
