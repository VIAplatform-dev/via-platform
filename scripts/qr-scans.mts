/**
 * Where the printed QR codes are being scanned.
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/qr-scans.mts
 *   node --env-file=.env.local --experimental-strip-types scripts/qr-scans.mts 30   # last 30 days
 *
 * Location is Vercel's edge geo — city-level, from the scanner's IP. It is blank for
 * scans recorded locally (no edge headers) and can be off by a metro area on cellular
 * or a VPN, so read it as "roughly where", not as a pin.
 */
import { listQrCodes } from "../app/lib/qr-codes-db.ts";
import { getQrScanTotals, getQrScanPlaces, getRecentQrScans } from "../app/lib/qr-scans-db.ts";

const days = Number(process.argv[2]) || undefined;

// Labels come from the qr_codes table. A code that has been deleted from it still has scans,
// so fall back to the bare slug rather than dropping the row from the report.
const codes = await listQrCodes();
const labels = new Map(codes.map((c) => [c.code, c.label]));
const label = (code: string) => labels.get(code) ?? code;
const when = (ts: string) => new Date(ts).toISOString().replace("T", " ").slice(0, 16);
const place = (r: { city: string | null; region: string | null; country: string | null }) =>
 [r.city, r.region, r.country].filter(Boolean).join(", ") || "unknown location";

const [totals, places, recent] = await Promise.all([
 getQrScanTotals(days),
 getQrScanPlaces(days),
 getRecentQrScans(15),
]);

const window = days ? `last ${days} days` : "all time";

if (!totals.length) {
 console.log(`No scans yet (${window}).`);
 process.exit(0);
}

console.log(`\nSCANS BY CODE (${window})`);
for (const t of totals) {
 console.log(`  ${String(t.scans).padStart(5)}  ${label(t.code)}  —  last ${when(t.lastScan)}`);
}

console.log(`\nWHERE (${window})`);
for (const code of totals.map((t) => t.code)) {
 const rows = places.filter((p) => p.code === code);
 if (!rows.length) continue;
 console.log(`  ${label(code)}`);
 for (const r of rows) {
  const pin = r.latitude && r.longitude ? `  (${r.latitude}, ${r.longitude})` : "";
  console.log(`    ${String(r.scans).padStart(5)}  ${place(r)}${pin}`);
 }
}

console.log("\nMOST RECENT");
for (const r of recent) {
 console.log(`  ${when(r.timestamp)}  ${label(r.code).padEnd(20)}  ${place(r)}  [${r.deviceType ?? "unknown"}]`);
}
console.log("");
