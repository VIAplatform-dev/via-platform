// "Needs you", counted.
//
// Home (web) and the phone hub both show a row for each thing waiting on the seller. This is the
// one place that decides what counts, what it is called and where the row goes, so the two
// surfaces never disagree. Pure: the DB gathering lives in attention-db.ts.

import { agingBuckets, AGING_THRESHOLDS } from "./aging-core.ts";

export type AttentionCounts = {
 noPhoto: number;
 unpriced: number;
 /** Live pieces whose intake price confidence was under the threshold and that were not re-priced since. */
 lowConfidence: number;
 costMissing: number;
 holdsToday: number;
 pickupsWaiting: number;
 unanswered24h: number;
 payoutsDue: number;
 crossListingFailed: number;
 over90: number;
 over60: number;
};

type ItemLike = { id: string; status?: string | null; priceCents?: number | null; costCents?: number | null; images?: string[] | null; createdAt?: string | Date | null };

const inProgress = (s: string | null | undefined) => s === "active" || s === "draft";

/** The item-derived half of the counts. `lowConfidenceIds` comes from intake memory (see intake-memory-db). */
export function itemCounts(items: ItemLike[], lowConfidenceIds: Set<string>, now = new Date()): Pick<AttentionCounts, "noPhoto" | "unpriced" | "lowConfidence" | "costMissing" | "over90" | "over60"> {
 let noPhoto = 0, unpriced = 0, lowConfidence = 0, costMissing = 0;
 for (const it of items) {
  if (inProgress(it.status)) {
   if (!(it.images?.length)) noPhoto += 1;
   if (!((it.priceCents ?? 0) > 0)) unpriced += 1;
  }
  if (it.status === "active") {
   if (it.costCents == null) costMissing += 1;
   if (lowConfidenceIds.has(it.id)) lowConfidence += 1;
  }
 }
 const aging = agingBuckets(items, now);
 return { noPhoto, unpriced, lowConfidence, costMissing, over90: aging.over90, over60: aging.over60 };
}

export type AttentionRow = {
 id: keyof AttentionCounts | "aging";
 label: string;
 count: number;
 href: string;
 urgent: boolean;
};

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Only rows with something in them, in a fixed order. Empty when nothing is waiting. */
export function attentionRows(c: AttentionCounts, base = "/admin"): AttentionRow[] {
 const rows: AttentionRow[] = [];
 if (c.noPhoto > 0) rows.push({ id: "noPhoto", label: `${n(c.noPhoto, "piece", "pieces")} without a photo`, count: c.noPhoto, href: `${base}/inventory?missing=photo`, urgent: true });
 if (c.unpriced > 0) rows.push({ id: "unpriced", label: `${c.unpriced} unpriced ${c.unpriced === 1 ? "piece" : "pieces"}`, count: c.unpriced, href: `${base}/inventory?missing=price`, urgent: true });
 if (c.lowConfidence > 0) rows.push({ id: "lowConfidence", label: `${c.lowConfidence} AI ${c.lowConfidence === 1 ? "price" : "prices"} to check`, count: c.lowConfidence, href: `${base}/inventory?missing=confidence`, urgent: true });
 if (c.costMissing > 0) rows.push({ id: "costMissing", label: `${n(c.costMissing, "piece", "pieces")} with no cost`, count: c.costMissing, href: `${base}/inventory?missing=cost`, urgent: false });
 if (c.holdsToday > 0) rows.push({ id: "holdsToday", label: "Holds lapse today", count: c.holdsToday, href: `${base}/inventory?status=reserved`, urgent: true });
 if (c.pickupsWaiting > 0) rows.push({ id: "pickupsWaiting", label: `${n(c.pickupsWaiting, "collection", "collections")} waiting`, count: c.pickupsWaiting, href: `${base}/orders?delivery=pickup`, urgent: true });
 if (c.unanswered24h > 0) rows.push({ id: "unanswered24h", label: `${n(c.unanswered24h, "message", "messages")} waiting over a day`, count: c.unanswered24h, href: `${base}/inbox`, urgent: true });
 if (c.payoutsDue > 0) rows.push({ id: "payoutsDue", label: `${c.payoutsDue} consignor ${c.payoutsDue === 1 ? "payout" : "payouts"} due`, count: c.payoutsDue, href: `${base}/consignment/payouts`, urgent: true });
 if (c.crossListingFailed > 0) rows.push({ id: "crossListingFailed", label: `${n(c.crossListingFailed, "piece", "pieces")} failed to post`, count: c.crossListingFailed, href: `${base}/cross-listing`, urgent: true });
 if (c.over90 > 0) rows.push({ id: "aging", label: `Listed over ${AGING_THRESHOLDS.stale} days`, count: c.over90, href: `${base}/inventory?sort=oldest`, urgent: false });
 else if (c.over60 > 0) rows.push({ id: "aging", label: `Listed over ${AGING_THRESHOLDS.attention} days`, count: c.over60, href: `${base}/inventory?sort=oldest`, urgent: false });
 return rows;
}
