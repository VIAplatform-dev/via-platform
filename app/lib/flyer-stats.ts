import { neon } from "@neondatabase/serverless";
import { FLYERS, flyerSource } from "./flyers.ts";
import { getQrScanTotals } from "./qr-scans-db.ts";

// How each printed flyer is doing: how many people scanned it, and how many of those joined.
//
// Two tables answer this, and neither is only about flyers — qr_scans is shared with the printed
// business cards (/q/{code}), and pilot_access.source with the waitlist and every other signup
// path. So both are filtered to the `flyer:` prefix before anything is counted; the alternative
// is a report where 500 waitlist signups appear to have come from a lamppost.

export type FlyerStat = {
 slug: string;
 headline: string;
 scans: number;
 signups: number;
 /** Whole percent, or null when nothing has been scanned yet. */
 conversion: number | null;
 lastScan: string | null;
};

/**
 * Pure so the arithmetic is testable without a database.
 *
 * EVERY FLYER APPEARS, including ones with no scans at all — that row is the most useful one on
 * the page, because it is the flyer nobody is walking past. Showing only what has data would read
 * as "too early to tell" when the truth is "this one is not working".
 */
export function buildFlyerReport(
 scanRows: { code: string; scans: number; lastScan: string }[],
 signupRows: { source: string; signups: number }[],
): FlyerStat[] {
 const scansBy = new Map(scanRows.map((r) => [r.code, r]));
 const signupsBy = new Map(signupRows.map((r) => [r.source, r.signups]));

 return FLYERS.map((f) => {
  const key = flyerSource(f.slug);
  const scan = scansBy.get(key);
  const scans = scan?.scans ?? 0;
  const signups = signupsBy.get(key) ?? 0;
  return {
   slug: f.slug,
   headline: f.headline,
   scans,
   signups,
   // Capped at 100: someone can type the address off the poster, or scan with a browser we
   // classified as a bot, and a 500% column is unreadable rather than informative.
   conversion: scans === 0 ? null : Math.min(100, Math.round((signups / scans) * 100)),
   lastScan: scan?.lastScan ?? null,
  };
 }).sort((a, b) => b.scans - a.scans);
}

function db() {
 const url = process.env.DATABASE_URL;
 if (!url) throw new Error("DATABASE_URL is not set");
 return neon(url);
}

/** Signups per flyer, straight from the column the join endpoint writes. */
export async function getFlyerSignupTotals(): Promise<{ source: string; signups: number }[]> {
 const rows = await db()`
  SELECT source, COUNT(*)::int AS signups
  FROM pilot_access
  WHERE source LIKE 'flyer:%'
  GROUP BY 1`;
 return (rows as { source: string; signups: number }[]).map((r) => ({ source: r.source, signups: Number(r.signups) }));
}

/** The whole report. `sinceDays` narrows the scans; signups are lifetime. */
export async function getFlyerReport(sinceDays?: number): Promise<FlyerStat[]> {
 const [scans, signups] = await Promise.all([
  getQrScanTotals(sinceDays).catch(() => []),
  getFlyerSignupTotals().catch(() => []),
 ]);
 return buildFlyerReport(scans, signups);
}
