// Which of a listing's options is its BUY price — and whether it has one at all.
//
// A Shopify listing can carry several options at several prices. The importer used to take the first
// option's price as the piece's price. That is right for a one-of-one or a size run, and wrong for a
// rental shop: venusvintage.co lists 3 Day Rental / 7 Day Rental / Purchase on every piece and leaves
// an option at $0.00 to mean "not offered" (its theme hides those). Read first-option, 116 of its 135
// pieces arrived with no price and were skipped, and a $540 pair of Dior slingbacks was listed at its
// $22 rental.
//
// So: a $0 option is not offered, a rental option is never the buy price, and a piece whose only
// priced options are rentals is RENT-ONLY — it has no buy price, rather than being sold at its rental.
//
// Pure — no I/O — so the public feed, the collection reader and the connected-store Admin API all
// price a listing the same way.

const RENTAL_WORD = /\b(rent|rental|rentals|hire)\b/i;
const PURCHASE_WORD = /\b(purchase|buy)\b/i;

/** Is this option a rental ("3 Day Rental", "Rent", "Hire - 1 week")? Whole words only, so
 *  "Parent's Coat" and "Torrent Blue" are not. */
export function isRentalOption(label: string | null | undefined): boolean {
 return RENTAL_WORD.test(String(label ?? ""));
}

/** What the picker needs to know about one option, however the caller's variant is shaped. */
export type OptionRead = { label: string | null | undefined; price: number | null | undefined };

export type BuyPick<V> = {
 /** The option the piece is bought as; null when nothing can be bought. */
 variant: V | null;
 price: number | null;
 /** Nothing to buy, but at least one rental option is priced. */
 rentOnly: boolean;
};

const isPriced = (p: number | null | undefined): p is number => typeof p === "number" && Number.isFinite(p) && p > 0;

export function pickBuyVariant<V>(variants: V[], read: (v: V) => OptionRead): BuyPick<V> {
 if (!variants.length) return { variant: null, price: null, rentOnly: false };
 const rows = variants.map((v) => ({ v, ...read(v), rental: isRentalOption(read(v).label) }));
 const hasRental = rows.some((r) => r.rental);
 // In listed order, so an ordinary size run is still priced by its first size.
 const chosen = rows.find((r) => !r.rental && isPriced(r.price));
 if (chosen) return { variant: chosen.v, price: chosen.price as number, rentOnly: false };
 if (hasRental) return { variant: null, price: null, rentOnly: rows.some((r) => r.rental && isPriced(r.price)) };
 // Nothing priced anywhere. Keep exactly what the first-option read gave — a seller zeroes the price
 // of a SOLD piece and keeps it as archive, and the importer decides what that means from availability.
 const first = rows[0];
 return { variant: first.v, price: typeof first.price === "number" && Number.isFinite(first.price) ? first.price : null, rentOnly: false };
}

/** The options a piece is SOLD in. Rental options are not sizes and cannot be bought; a listing
 *  with no rental options comes back untouched. */
export function withoutRentalOptions<V>(variants: V[], read: (v: V) => OptionRead): V[] {
 const rental = variants.map((v) => isRentalOption(read(v).label));
 return rental.some(Boolean) ? variants.filter((_v, i) => !rental[i]) : variants;
}

/** An option's label as a size, or null when it is not one ("Purchase", "Buy", a rental, blank). */
export function sizeFromOptionLabel(label: string | null | undefined): string | null {
 const s = String(label ?? "").trim();
 if (!s || s === "Default Title" || PURCHASE_WORD.test(s) || isRentalOption(s)) return null;
 return s;
}

const RENTAL_DAYS = /(\d+)\s*day/i;

/**
 * The piece's rental price ladder — one tier per priced rental option, e.g. "3 Day Rental" $22 and
 * "7 Day Rental" $80 both real, "3 Day Rental" $0 not offered. Empty for a listing with no rental
 * options, or a rental option that doesn't say how many days ("Weekend Rental") — there is nothing to
 * bill a longer or shorter stay against, and guessing a day count would misprice every booking.
 *
 * Purchase is never a tier: buying and renting are different transactions with different money, and
 * this ladder is only ever read by the rental side (rentals-db.ts saves it as-is into rental_terms).
 */
export function rentalTiersFromOptions<V>(variants: V[], read: (v: V) => OptionRead): { days: number; cents: number }[] {
 const tiers: { days: number; cents: number }[] = [];
 for (const v of variants) {
  const { label, price } = read(v);
  if (!isRentalOption(label) || !isPriced(price)) continue;
  const m = RENTAL_DAYS.exec(String(label ?? ""));
  if (!m) continue;
  tiers.push({ days: Number(m[1]), cents: Math.round((price as number) * 100) });
 }
 return tiers.sort((a, b) => a.days - b.days);
}
