/**
 * Which of a seller's products are genuinely absent from her hosted store.
 *
 * "Missing" used to mean "in her feed, not in ours", and it graded BLOCKING. Every single one of
 * bag-crush's 33 turned out to be a piece she had sold and not deleted, or a pre-order she never
 * photographed — nothing a shopper could buy, and nothing we were wrong to leave out. Six stores
 * were failing on that.
 *
 * So the question is asked the way a shopper would: could I buy this today? That needs a variant
 * that is BOTH available and priced. A piece with a price and nothing in stock is sold; a piece
 * available at no price is not for sale.
 *
 * Photos are separated out rather than lumped in. A piece that is in stock and priced but has no
 * image on her own site cannot be rendered as a card by anyone — that is hers to fix, and saying so
 * is more use to her than calling it a product we dropped.
 */
type FeedVariant = { available: boolean; price: string };
export type FeedProduct = { handle: string; title: string; variants: FeedVariant[]; images?: { src?: string }[] };

/** Could a shopper buy this today? */
export const buyable = (p: FeedProduct): boolean =>
 (p.variants || []).some((v) => v.available && Number(v.price) > 0);

const hasPhoto = (p: FeedProduct): boolean => (p.images?.length ?? 0) > 0;

type MissingReport = {
 /** Buyable, photographed, and not on our copy. The only ones worth blocking a store over. */
 missing: FeedProduct[];
 /** Buyable and priced, but she has no photo of it — nobody can render it, including her. */
 noPhoto: FeedProduct[];
 /** Sold, or not for sale. Left out on purpose. */
 unsellable: FeedProduct[];
};

export function classifyMissing(feed: FeedProduct[], ourHandles: Set<string>): MissingReport {
 const out: MissingReport = { missing: [], noPhoto: [], unsellable: [] };
 for (const p of feed) {
  if (ourHandles.has(p.handle)) continue;
  if (!buyable(p)) out.unsellable.push(p);
  else if (!hasPhoto(p)) out.noPhoto.push(p);
  else out.missing.push(p);
 }
 return out;
}
