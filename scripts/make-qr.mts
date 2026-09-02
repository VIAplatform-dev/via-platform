/**
 * Generate the printable QR images.
 *
 *   node --experimental-strip-types scripts/make-qr.mts getvya fendi-ny   # named codes, no DB
 *   node --env-file=.env.local --experimental-strip-types scripts/make-qr.mts   # every active code
 *
 * Writes .qr/<code>.png (2048px, for anything raster) and .qr/<code>.svg (vector, for anything
 * going to a printer).
 *
 * The image only ever encodes https://getvya.ai/q/<code> — never the destination. That is the
 * whole point: where a code leads is a row in Neon, so you can repoint it after the cards are
 * printed and never reprint. Regenerating is therefore safe and, for a given code, produces
 * exactly the same image every time.
 */
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { qrTargetUrl, normalizeQrCode } from "../app/lib/qr-codes.ts";

const OUT_DIR = ".qr";
// "H" survives a scuffed card or a sticker curling on a booth sign — it recovers ~30% of the
// code. The URL is short, so the extra density costs almost nothing.
const ERROR_CORRECTION = "H" as const;

const requested = process.argv.slice(2).filter((a) => !a.startsWith("-")).map(normalizeQrCode).filter(Boolean);

// Naming codes keeps this DB-free, which is why the printing path does not need .env.local.
// Listing them all obviously does.
let codes = requested;
if (!codes.length) {
 const { listQrCodes } = await import("../app/lib/qr-codes-db.ts");
 codes = (await listQrCodes()).filter((c) => c.active).map((c) => c.code);
 if (!codes.length) {
  console.error("No active codes. Run: scripts/qr-codes.mts seed");
  process.exit(1);
 }
}

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const code of codes) {
 const target = qrTargetUrl(code);
 const png = path.join(OUT_DIR, `${code}.png`);
 const svg = path.join(OUT_DIR, `${code}.svg`);

 await QRCode.toFile(png, target, { width: 2048, margin: 2, errorCorrectionLevel: ERROR_CORRECTION });
 fs.writeFileSync(svg, await QRCode.toString(target, { type: "svg", margin: 2, errorCorrectionLevel: ERROR_CORRECTION }));

 console.log(`${code}`);
 console.log(`  encodes ${target}`);
 console.log(`  ${png}`);
 console.log(`  ${svg}`);
}
