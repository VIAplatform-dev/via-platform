// How long a piece has been on the rail.
//
// Vintage does not expire, but a rack does: the piece that has sat 90 days is the one to reshoot,
// reprice or take to the market. Pure arithmetic over created_at so Home, Inventory and the phone
// all agree on what "old" means.

const DAY_MS = 86_400_000;

export const AGING_THRESHOLDS = { attention: 60, stale: 90 } as const;

export function daysListed(createdAt: string | Date | null | undefined, now = new Date()): number | null {
 if (!createdAt) return null;
 const t = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
 if (!Number.isFinite(t)) return null;
 return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

const LIVE = new Set(["active", "listed", "live", "available"]);
export const isLiveStatus = (status: string | null | undefined) => LIVE.has(String(status ?? "").toLowerCase());

export type AgingBuckets = { live: number; over60: number; over90: number };

export function agingBuckets(items: Array<{ status?: string | null; createdAt?: string | Date | null }>, now = new Date()): AgingBuckets {
 const b: AgingBuckets = { live: 0, over60: 0, over90: 0 };
 for (const it of items) {
  if (!isLiveStatus(it.status)) continue;
  b.live += 1;
  const d = daysListed(it.createdAt, now);
  if (d === null) continue;
  if (d >= AGING_THRESHOLDS.attention) b.over60 += 1;
  if (d >= AGING_THRESHOLDS.stale) b.over90 += 1;
 }
 return b;
}

const pieces = (n: number) => `${n} piece${n === 1 ? "" : "s"}`;

/** The one line Home shows about aging stock, or nothing when there is nothing to say. */
export function agingTile(b: AgingBuckets): string | null {
 if (b.over90 > 0) return `${pieces(b.over90)} over ${AGING_THRESHOLDS.stale} days`;
 if (b.over60 > 0) return `${pieces(b.over60)} over ${AGING_THRESHOLDS.attention} days`;
 return null;
}
