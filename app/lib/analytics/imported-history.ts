/**
 * A store's history from before VYA, folded into its dashboard. Pure.
 *
 * MIXED IN, NOT BOLTED ON. A seller who moved from Shopify wants one continuous line: her shop did
 * £4k in March whether the money arrived through Shopify or through VYA. Showing her two numbers and
 * asking her to add them up is showing her our plumbing.
 *
 * MIXED, BUT KNOWABLE. The total also reports how much of itself came from an import, so the
 * dashboard can say so in a line of small type. Silently absorbing a seller's pre-VYA revenue into
 * "your VYA revenue" would let the platform take credit for two years of somebody else's work,
 * and would make it impossible for her to tell whether any of this is going well.
 *
 * WHAT IT CANNOT JOIN. An imported order carries a title as free text and nothing else, no brand,
 * no category, no link to an item that no longer exists. So top brands and top categories stay
 * VYA-only, and say so, rather than quietly under-reporting against a mixed revenue figure.
 */
import type { ChannelKey } from "./channels";

/** Financial states from a Shopify/Square export that are NOT a sale. */
const NOT_A_SALE = /refund|cancel|void|charge.?back|declin|fail|pending|unpaid|abandon/i;

/**
 * Does an imported row count towards revenue?
 *
 * Exports carry a financial status in a dozen spellings, and the ones that matter are the negatives.
 * Anything unrecognised counts. A blank status on a row with a total is far more likely to be an
 * ordinary sale than a refund, and dropping real revenue is the worse mistake here.
 */
export function countsAsSale(status: string | null | undefined): boolean {
 const s = String(status || "").trim();
 if (!s) return true;
 return !NOT_A_SALE.test(s);
}

export type DayPoint = { day: string; cents: number };

/** Two day-series into one, summed per day, in date order. */
export function mergeByDay(a: DayPoint[], b: DayPoint[]): DayPoint[] {
 const total = new Map<string, number>();
 for (const p of [...(a || []), ...(b || [])]) {
  if (!p || !p.day) continue;
  total.set(p.day, (total.get(p.day) || 0) + (Number(p.cents) || 0));
 }
 // "MM-DD" sorts correctly as a string within a window, which is what the chart shows.
 return [...total.entries()].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)).map(([day, cents]) => ({ day, cents }));
}

/** A sale, with where it came from. See channels.ts. The channel travels with it so a merged list
 *  can still say "Depop" or "Shopify" against each row. */
export type Sale = { title: string; amountCents: number; at: string | null; channel: ChannelKey; channelLabel: string };

/** The most recent sales across both, newest first. Undated rows sort last, never first. */
export function mergeRecent(a: Sale[], b: Sale[], limit: number): Sale[] {
 return [...(a || []), ...(b || [])]
  .filter(Boolean)
  .sort((x, y) => {
   const xa = x.at ? Date.parse(x.at) : -Infinity;
   const ya = y.at ? Date.parse(y.at) : -Infinity;
   return ya - xa;
  })
  .slice(0, Math.max(0, limit));
}
