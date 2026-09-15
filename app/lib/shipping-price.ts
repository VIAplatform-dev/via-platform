import { getRates } from "./ship-provider";
import { quoteShipping } from "./shipping-zones";
import { quoteFromRate } from "./shipping-markup-core";
import { isoCountry } from "./ship-from-core";
import type { ShippingSettings } from "./store-shipping-db";
import type { ParcelDims } from "./shipping-tiers";

// What the buyer is charged for postage. ONE answer, for every caller.
//
// THIS EXISTS BECAUSE THE QUOTE AND THE CHARGE MUST BE THE SAME NUMBER. Three routes need a
// shipping price: /shipping-rates and /cart-shipping (what she is SHOWN) and /cart-intent (what
// she is CHARGED, server-authoritative, because a client could otherwise post zero and dodge the
// label). When those were three separate calculations, showing one price and charging another was
// one edit away, and that edit is invisible in testing until a buyer complains about their
// receipt. They now all call this.
//
// STORES CHOOSE HOW THEY PRICE. It is their own website, not a marketplace stall, so the policy is
// theirs the way it is on Shopify:
//
//   "live": the real carrier rate for this parcel on this route, plus VYA's markup. Fairer per
//            order (a near buyer pays less), and it can never be sold below cost. This is the
//            default, and the right one at a 1% platform fee: VYA takes all of the buyer's
//            shipping and buys the label, so absorbing distance variance comes straight out of a
//            margin that is already thin.
//
//   "flat": the store's own per-zone, per-size prices (shipping-zones.ts). One number the buyer
//            can predict, which is what most resale sellers are used to quoting. The store owns
//            the risk that a far parcel costs more than it charged.
//
// Falling back is always toward "flat": if the carrier is slow, unconfigured, or down, a quote
// that is occasionally generous beats a checkout that cannot complete.

export type BuyerShipping = {
  ok: boolean;
  amountCents: number;
  service: string;
  estDays: number | null;
  /** Which rule produced this number. Worth logging, and worth showing in the seller's settings. */
  source: "live" | "flat";
  /** Set when the store does not ship to this destination at all. */
  refusedCountry?: boolean;
  /** Set when NOBODY on VYA may: an embargo or a carrier suspension, not the store's choice. */
  restricted?: boolean;
  /** Shown to the shopper when `restricted`. See shipping-embargo.ts. */
  message?: string;
};

export type ShipAddressish = {
  name?: string | null; street1?: string | null; street2?: string | null; city?: string | null;
  state?: string | null; zip?: string | null; country?: string | null; phone?: string | null; email?: string | null;
};

/**
 * The buyer's postage for this parcel, on this route, under this store's policy.
 *
 * `parcel` must be the SAME parcel the label will be bought at, or the quote promises a price the
 * purchase will not honour.
 */
export async function resolveBuyerShipping(opts: {
  settings: ShippingSettings;
  sellerName: string;
  sellerEmail?: string | null;
  to: ShipAddressish;
  parcel: ParcelDims & { weightOz: number; lengthIn: number; widthIn: number; heightIn: number };
}): Promise<BuyerShipping> {
  const { settings, to, parcel } = opts;
  const from = settings.shipFrom;

  // The zone price is computed first, always: it is both the "flat" answer and the safety net
  // under the live one, and it is also what decides whether this store serves the country at all.
  const flat = quoteShipping({
    fromCountry: isoCountry(from?.country),
    toCountry: isoCountry(to.country),
    // The state/province, which only exists once a shopper has typed an address. It is what lets
    // an embargoed REGION be refused inside a country that is otherwise fine: Ukraine is shippable
    // and Crimea is not, and a product page cannot know which of the two it is looking at.
    toRegion: to.state,
    parcel,
    zones: settings.zones,
  });
  if (!flat.ok) {
    return {
      ok: false, amountCents: 0, service: "", estDays: null, source: "flat", refusedCountry: true,
      // Why, when it is not the shop's decision. "This store doesn't post here" is a lie about a
      // destination the store DID tick, and the shopper has no way to tell the two apart.
      ...(flat.reason === "restricted" ? { restricted: true as const, message: flat.message } : {}),
    };
  }

  const flatAnswer: BuyerShipping = {
    ok: true, amountCents: flat.amountCents, service: "Standard", estDays: null, source: "flat",
  };

  if ((settings.pricing ?? "live") !== "live") return flatAnswer;
  // Live needs a real origin. A store that has not finished its ship-from cannot be rated.
  if (!from?.street1 || !from.city || !from.zip) return flatAnswer;

  try {
    const rates = await getRates(
      {
        name: from.name || opts.sellerName, street1: from.street1, street2: from.street2,
        city: from.city, state: from.state || "", zip: from.zip,
        country: isoCountry(from.country), phone: from.phone, email: opts.sellerEmail || undefined,
      },
      {
        name: to.name || "", street1: to.street1 || "", street2: to.street2,
        city: to.city || "", state: to.state || "", zip: to.zip || "",
        country: isoCountry(to.country), phone: to.phone, email: to.email,
      },
      parcel,
    );
    if (!rates.length) return flatAnswer;
    const q = quoteFromRate(rates[0]);
    return { ok: true, amountCents: q.buyerPaysCents, service: q.service, estDays: q.estDays, source: "live" };
  } catch {
    /* allow-swallow: never block a sale on a carrier hiccup. The flat price is a safe answer */
    return flatAnswer;
  }
}

/**
 * The faster option, when the store offers one.
 *
 * Only ever returned alongside the standard quote, and only when it is genuinely quicker. A
 * second line at the same speed for more money is not a choice, it is a trick.
 */
export async function resolveExpedited(opts: {
  settings: ShippingSettings;
  sellerName: string;
  sellerEmail?: string | null;
  to: ShipAddressish;
  parcel: ParcelDims & { weightOz: number; lengthIn: number; widthIn: number; heightIn: number };
  standardEstDays: number | null;
}): Promise<BuyerShipping | null> {
  if (!opts.settings.expeditedOffered) return null;
  if ((opts.settings.pricing ?? "live") !== "live") return null; // a flat store has no second price
  const from = opts.settings.shipFrom;
  if (!from?.street1 || !from.city || !from.zip) return null;

  try {
    const rates = await getRates(
      {
        name: from.name || opts.sellerName, street1: from.street1, street2: from.street2,
        city: from.city, state: from.state || "", zip: from.zip,
        country: isoCountry(from.country), phone: from.phone, email: opts.sellerEmail || undefined,
      },
      {
        name: opts.to.name || "", street1: opts.to.street1 || "", street2: opts.to.street2,
        city: opts.to.city || "", state: opts.to.state || "", zip: opts.to.zip || "",
        country: isoCountry(opts.to.country), phone: opts.to.phone, email: opts.to.email,
      },
      opts.parcel,
    );
    const base = opts.standardEstDays;
    const faster = rates.find((r) => r.estDays != null && (base == null || r.estDays < base));
    if (!faster) return null;
    const q = quoteFromRate(faster);
    return { ok: true, amountCents: q.buyerPaysCents, service: "Express", estDays: q.estDays, source: "live" };
  } catch {
    return null;
  }
}

