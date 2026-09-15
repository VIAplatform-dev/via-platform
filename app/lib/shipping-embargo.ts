// Destinations VYA does not carry, whatever a store's zones say. Pure, no I/O.
//
// WHY THIS IS NOT A STORE SETTING, which is the whole design and the part worth reading.
//
// Zones let a store choose where it is WILLING to post. That is a preference. This is not: it is
// the list of places a parcel may not be sent from this platform at all, and a seller ticking a box
// cannot make one of them available any more than she can make herself exempt. So it is enforced in
// the two functions everything else routes through (shipsTo and quoteShipping in shipping-zones.ts)
// rather than in a form, and there is deliberately no override anywhere.
//
// It is the way Shopify handles it, and the reason is the same: a merchant on Shopify never sees
// an embargoed country in the shipping-zone picker, because it is the platform that would be in
// breach, not only the merchant. A rule that lives in a settings screen is a rule that is off by
// one deploy, one API call, or one seller who read the docs.
//
// WHAT WAS HAPPENING BEFORE. "Rest of world" is a catch-all: any country not in the Europe or North
// America buckets. A store that ticked it was publicly offering to post to Iran, North Korea, Syria
// and Cuba, and the storefront said so in its "we ship to" line. Nothing anywhere refused it, at the
// product page or at checkout.
//
// TWO DIFFERENT REASONS, KEPT APART. An embargo is a legal bar. A suspension is the carriers having
// stopped: no label can be bought, so accepting the order would mean taking money for a parcel
// nobody will move. Both refuse, and a seller looking into it deserves to know which.
//
// THIS LIST IS NOT LEGAL ADVICE and it is not jurisdiction-aware. It is the comprehensively
// embargoed set under US sanctions, which is the floor for a US-incorporated platform whatever the
// seller's own country requires of her. A store in the UK or the EU may be barred from more than
// this. Widening it is one edit, here.

/**
 * Comprehensive embargo: no transaction, no parcel, no exceptions.
 *
 * Country-level. The regions below cover the parts of a country that is otherwise fine.
 */
import { countryShortName } from "./ships-to-core.ts";

export const EMBARGOED_COUNTRIES: ReadonlySet<string> = new Set(["CU", "IR", "KP", "SY"]);

/**
 * Embargoed REGIONS inside a country that is otherwise perfectly shippable.
 *
 * Ukraine is the case this exists for, and it is why Ukraine is NOT simply cut out of Europe. The
 * country is legal to post to and shops sell there; three occupied regions are not. Removing the
 * whole country to avoid the awkwardness would refuse Kyiv to protect us from Crimea, and Shopify
 * does not do that either: it sells to Ukraine and bars the regions.
 *
 * Matched loosely on purpose. A checkout address is typed by a shopper, not chosen from a list, so
 * "Crimea", "Crimea Republic", "AR Krym" and "Автономна Республіка Крим" all have to land.
 */
/**
 * NOT `\b`. JavaScript's word boundary is ASCII-only: `\w` is [A-Za-z0-9_], so between a space and
 * a Cyrillic letter there is no boundary at all, and /\bкрим/ never matches "Республіка Крим". A
 * Unicode lookbehind is boundary-correct in both alphabets.
 *
 * Start-of-word only, with no closing boundary, because these arrive inflected: "Donetska oblast",
 * "Луганська область", "Crimean". Anchoring the end would mean listing every form.
 */
const startsWord = (alternatives: string) =>
 new RegExp(String.raw`(?<![\p{L}\p{N}])(?:` + alternatives + ")", "iu");

export const EMBARGOED_REGIONS: Readonly<Record<string, readonly RegExp[]>> = {
 UA: [
  startsWord("crimea|krym|крим|крым"),
  startsWord("sevastopol|sevastopil|севастополь"),
  startsWord("donetsk|донецьк|донецк"),
  startsWord("luhansk|lugansk|луганськ|луганск"),
 ],
};

/**
 * Carriers have stopped, so no label exists to buy.
 *
 * Separate from the embargo list because it is a different fact with a different lifetime: this one
 * can be revisited when service resumes, and the reason shown to a shopper is not an accusation.
 */
export const SUSPENDED_COUNTRIES: ReadonlySet<string> = new Set(["RU", "BY"]);

export type Barred = { barred: true; reason: "embargo" | "suspended"; message: string };
export type NotBarred = { barred: false };
export type DestinationBar = Barred | NotBarred;

const OK: NotBarred = { barred: false };

const code = (v: unknown): string => String(v ?? "").trim().toUpperCase();

/**
 * May a parcel go to this destination at all?
 *
 * `region` is the state/province from a checkout address, when there is one. A product page has no
 * address yet and passes nothing, which is correct: it can only answer for the country, and a
 * country-level bar is the only one it could honestly apply that early.
 *
 * The message is written to be SHOWN. A shopper who cannot check out is owed a reason, and "not
 * served" for a country the store did tick reads as a bug rather than a rule.
 */
export function destinationBar(country: unknown, region?: unknown): DestinationBar {
 const c = code(country);
 if (!/^[A-Z]{2}$/.test(c)) return OK; // not a country yet; nothing to decide

 if (EMBARGOED_COUNTRIES.has(c)) {
  return { barred: true, reason: "embargo", message: "We can't ship to this country. Trade sanctions prevent it, and that isn't the shop's choice." };
 }
 if (SUSPENDED_COUNTRIES.has(c)) {
  return { barred: true, reason: "suspended", message: "Postal and courier services to this country are suspended, so no delivery can be bought." };
 }

 const r = String(region ?? "").trim();
 if (r) {
  for (const re of EMBARGOED_REGIONS[c] ?? []) {
   if (re.test(r)) {
    return { barred: true, reason: "embargo", message: "We can't ship to this region. Trade sanctions prevent it, and that isn't the shop's choice." };
   }
  }
 }
 return OK;
}

/** Whether a parcel may go there. The predicate, for callers that don't need the reason. */
export function canShipTo(country: unknown, region?: unknown): boolean {
 return !destinationBar(country, region).barred;
}

/**
 * What to tell a shopper whose address was refused.
 *
 * ONE SENTENCE, AND THE RIGHT ONE. Every route said "This store doesn't ship to that country yet",
 * which is true for a region the seller chose not to serve and a lie for one nobody may serve: the
 * store HAD ticked it, nothing it does will change the answer, and "yet" promises otherwise. A
 * shopper reading that blames the shop for a trade sanction.
 *
 * Takes either shape, because two of the four routes quote through resolveBuyerShipping and two
 * call quoteShipping directly, and a refusal has to read the same in all four.
 */
export function refusalMessage(
  quote: { ok: boolean; restricted?: boolean; message?: string; reason?: string } | null | undefined,
): string {
  if (quote?.restricted || quote?.reason === "restricted") {
    return quote.message || "We can't ship to that address. Trade sanctions or suspended courier services prevent it, and that isn't the shop's choice.";
  }
  return "This store doesn't ship to that country yet.";
}

export type BarredPlace = { code: string; name: string };
export type BarredList = { reason: "embargo" | "suspended"; label: string; places: BarredPlace[] };

/**
 * The barred destinations, NAMED, for the settings page to print.
 *
 * "A few destinations are never available" is a sentence that answers nothing. A seller reading it
 * wants to know which, and Shipping and duties is where she is standing when she wonders: her
 * alternative is finding out from a customer who couldn't check out.
 *
 * Built FROM the sets above rather than written out again beside them, because a second list is a
 * list that goes stale. Names come from the platform's own CLDR data (countryShortName), so they
 * read the way a seller writes them rather than as ISO codes.
 *
 * The region entries are spelled out by hand: they have no country code of their own, which is
 * exactly why they need saying, since "Ukraine" appears nowhere on this list and a seller would
 * reasonably conclude the whole country was fine.
 */
export function barredDestinations(): BarredList[] {
 const named = (codes: ReadonlySet<string>): BarredPlace[] =>
  [...codes].map((code) => ({ code, name: countryShortName(code) || code })).sort((a, b) => a.name.localeCompare(b.name));

 return [
  {
   reason: "embargo",
   label: "Under trade sanctions",
   places: [
    ...named(EMBARGOED_COUNTRIES),
    // Not a country, and that is the point: enabling Europe enables Ukraine, and a seller has no
    // way to know these four are carved out of it unless it is written down.
    { code: "UA-43", name: "Crimea and Sevastopol (Ukraine)" },
    { code: "UA-14", name: "Donetsk and Luhansk (Ukraine)" },
   ],
  },
  {
   reason: "suspended",
   label: "No courier service",
   places: named(SUSPENDED_COUNTRIES),
  },
 ];
}
