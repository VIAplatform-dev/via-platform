// Gathers the "Needs you" counts for one store. Every source is best-effort: a rollup that fails
// counts as nothing, so a broken consignment query never blanks the row about photos. The words
// and the order live in attention-core.ts.

import { itemCounts, attentionRows, type AttentionCounts, type AttentionRow } from "./attention-core";
import { CONFIDENCE_THRESHOLD } from "./ai-intake";
import { getSellerBySlug } from "./db/sellers";
import { listSellerItems } from "./db/inventory";
import { countPickupsWaiting } from "./db/orders";
import { listHolds } from "./holds-db";
import { countUnansweredConversations } from "./messaging-db";
import { countUnansweredStoreConversations } from "./messages-db";
import { getConsignmentSummary } from "./consignment-db";
import { countCrossListingErrors } from "./cross-listing-db";
import { listLowConfidenceItemIds } from "./intake-memory-db";

export type Attention = { counts: AttentionCounts; rows: AttentionRow[]; lowConfidenceIds: string[] };

const zero = () => 0;

export async function attentionForStore(storeSlug: string, now = new Date()): Promise<Attention> {
 const seller = await getSellerBySlug(storeSlug).catch(() => null);
 const [items, lowConfidenceIds, holdsToday, pickupsWaiting, unansweredStorefront, unansweredMarketplace, payoutsDue, crossListingFailed] = await Promise.all([
  seller ? listSellerItems(seller.id).catch(() => []) : Promise.resolve([]),
  listLowConfidenceItemIds(storeSlug, CONFIDENCE_THRESHOLD).catch(() => [] as string[]),
  seller ? listHolds(seller.id, now).then((h) => h.today.length).catch(zero) : Promise.resolve(0),
  seller ? countPickupsWaiting(seller.id).catch(zero) : Promise.resolve(0),
  countUnansweredConversations(storeSlug, 24).catch(zero),
  countUnansweredStoreConversations(storeSlug, 24).catch(zero),
  getConsignmentSummary(storeSlug).then((s) => s.activity.filter((a) => a.status === "payable").length).catch(zero),
  countCrossListingErrors(storeSlug).catch(zero),
 ]);
 const counts: AttentionCounts = {
  ...itemCounts(items, new Set(lowConfidenceIds), now),
  holdsToday,
  pickupsWaiting,
  // Both inboxes: the storefront contact threads and the marketplace app's. One number — a buyer
  // waiting is a buyer waiting, whichever door she came in by.
  unanswered24h: unansweredStorefront + unansweredMarketplace,
  payoutsDue,
  crossListingFailed,
 };
 return { counts, rows: attentionRows(counts), lowConfidenceIds };
}
