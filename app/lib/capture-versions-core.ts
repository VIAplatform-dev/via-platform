/**
 * Version history for a captured page.
 *
 * `site_captures` holds ONE row per (store, path) and every write overwrites it in place — a
 * re-crawl, an editor save, or the asset-rehosting pass that runs over every page on every repair.
 * There is no copy anywhere, so a bad re-import (her site mid-redesign, a cookie wall served instead
 * of the page, a truncated response) destroys the good version with no way back. That is the hole
 * this closes.
 *
 * Everything here is pure so the rule that decides what to throw away is testable on its own. The
 * storage lives in capture-versions-db.ts.
 */

/** Why a version was kept — which is what makes pruning safe. */
export type VersionReason = "crawl" | "edit" | "rewrite";

export type VersionRow = {
 id: string;
 reason: VersionReason;
 /** ISO string or Date; only the ordering matters here. */
 createdAt: string | Date;
};

/**
 * How many versions of a page we keep.
 *
 * Three, not one: a page can be overwritten twice before anyone notices it broke — a repair rewrites
 * assets across every page, and a re-import may follow it the same day. One slot would mean the last
 * good copy is already gone by the time a seller says "my homepage looks wrong".
 */
export const KEEP_VERSIONS = 3;

function time(v: string | Date): number {
 return v instanceof Date ? v.getTime() : Date.parse(v);
}

/**
 * Which versions of one page should be deleted, given everything currently stored for it.
 *
 * Newest `keep` survive — and so does the most recent `crawl`, ALWAYS, even when it falls outside
 * that window. Without that exception the rule is worse than useless: the rehosting pass touches
 * every page on every repair, so three mechanical rewrites would evict the actual capture of her
 * site and leave three near-identical copies of the same broken page.
 *
 * Order-insensitive: callers hand over whatever the database returned.
 */
export function versionsToDrop(rows: VersionRow[], keep: number = KEEP_VERSIONS): string[] {
 if (keep < 1) return []; // a caller asking to keep nothing is a bug, not an instruction
 // `id` breaks the tie, and it has to: Postgres handed back whole-second timestamps in practice, so
 // three rewrites of one page in the same second are indistinguishable by time alone. The id is a
 // BIGSERIAL — the order the rows were actually written.
 const sorted = [...rows].sort((a, b) => (time(b.createdAt) - time(a.createdAt)) || (Number(b.id) - Number(a.id)));
 const survivors = new Set(sorted.slice(0, keep).map((r) => r.id));
 const newestCrawl = sorted.find((r) => r.reason === "crawl");
 if (newestCrawl) survivors.add(newestCrawl.id);
 return sorted.filter((r) => !survivors.has(r.id)).map((r) => r.id);
}

/**
 * Is this new content worth a version at all?
 *
 * The rehosting pass often rewrites a page to exactly what it already was. Storing that would spend
 * one of three slots to record that nothing happened, so identical content is skipped — compared on
 * a hash the caller already has, never on the megabyte of HTML itself.
 */
export function worthVersioning(previousHash: string | null | undefined, nextHash: string): boolean {
 return !!nextHash && previousHash !== nextHash;
}

/** What a seller-facing list of versions should say each entry IS. */
export function describeReason(r: VersionReason): string {
 return r === "crawl" ? "Imported from the store" : r === "edit" ? "Edited in the builder" : "Images re-hosted";
}
