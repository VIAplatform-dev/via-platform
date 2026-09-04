import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFlyerReport } from "./flyer-stats.ts";

const scans = [
 { code: "flyer:vintage", scans: 120, lastScan: "2026-09-03T10:00:00.000Z" },
 { code: "flyer:not-shein", scans: 40, lastScan: "2026-09-02T10:00:00.000Z" },
 { code: "card-001", scans: 999, lastScan: "2026-09-01T10:00:00.000Z" }, // a business card, not a flyer
];
const signups = [
 { source: "flyer:vintage", signups: 30 },
 { source: "flyer:not-shein", signups: 20 },
 { source: "waitlist", signups: 500 },
];

test("every flyer appears, including ones nobody has scanned", () => {
 // A flyer with zero scans is the most important row on this report — it is the one whose
 // lamppost nobody walks past. Dropping it would read as "no data yet" instead of "not working".
 const rows = buildFlyerReport(scans, signups);
 assert.equal(rows.length, 6);
 assert.equal(rows.find((r) => r.slug === "postcard")?.scans, 0);
});

test("scans and signups are matched to the right flyer", () => {
 const rows = buildFlyerReport(scans, signups);
 const v = rows.find((r) => r.slug === "vintage")!;
 assert.equal(v.scans, 120);
 assert.equal(v.signups, 30);
});

test("scan codes and signup sources that are not flyers are ignored", () => {
 // qr_scans is shared with the printed business cards, and pilot_access.source with the waitlist.
 const rows = buildFlyerReport(scans, signups);
 assert.equal(rows.some((r) => r.slug === "card-001"), false);
 assert.equal(rows.reduce((n, r) => n + r.signups, 0), 50); // not 550
});

test("conversion is signups over scans, as a whole percent", () => {
 const rows = buildFlyerReport(scans, signups);
 assert.equal(rows.find((r) => r.slug === "vintage")?.conversion, 25);
 assert.equal(rows.find((r) => r.slug === "not-shein")?.conversion, 50);
});

test("no scans means no conversion figure, not zero percent", () => {
 // 0 of 0 is not "nobody converted" — it is a number we cannot state, and printing 0% would
 // condemn a flyer that has simply never been seen.
 assert.equal(buildFlyerReport([], [])[0].conversion, null);
});

test("signups without a recorded scan do not produce over-100% nonsense", () => {
 // Real: someone types the URL off the poster instead of scanning, or scans with a browser we
 // classified as a bot. Capping keeps the column readable.
 const rows = buildFlyerReport(
  [{ code: "flyer:vintage", scans: 2, lastScan: "2026-09-03T10:00:00.000Z" }],
  [{ source: "flyer:vintage", signups: 10 }],
 );
 assert.equal(rows.find((r) => r.slug === "vintage")?.conversion, 100);
});

test("the busiest flyer sorts first, so the winner is the top line", () => {
 const rows = buildFlyerReport(scans, signups);
 assert.equal(rows[0].slug, "vintage");
 assert.equal(rows[1].slug, "not-shein");
});

test("each row carries the flyer's headline so the report reads like the posters", () => {
 const rows = buildFlyerReport(scans, signups);
 assert.match(rows.find((r) => r.slug === "emma-stolen-bag")!.headline, /Fendi baguette/);
});

test("totals cover every flyer, not just the scanned ones", () => {
 const rows = buildFlyerReport(scans, signups);
 assert.equal(rows.reduce((n, r) => n + r.scans, 0), 160);
});
