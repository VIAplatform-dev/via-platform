// The customs declaration for one order — the I/O half of customs.ts.
//
// One function, four callers (the automatic label, the seller's manual quote, the buy, and the
// order screen's rate list). They must agree: if the quote a seller is shown came from a shipment
// with no declaration and the purchase then attached one, the price she accepted isn't the price
// she pays — DDP rates are higher than DDU rates, because the duty is in them.

import { getItem } from "./db/inventory";
import { getShippingSettings } from "./store-shipping-db";
import { buildDeclaration, isInternational, restrictedMaterials, resolveDutyMode, type CustomsDeclaration, type RestrictionWarning, DEFAULT_DUTY_MODE } from "./customs";

export type OrderCustoms = {
 declaration: CustomsDeclaration | null;
 /** Exotic skins and furs worth telling the seller about before this leaves the country. */
 warnings: RestrictionWarning[];
 /** True when a US export needs an AES filing only the seller can make. */
 needsAesFiling: boolean;
 /** True when the store asked to cover duty but isn't on its own carrier account, so it can't. */
 dutyDowngraded: boolean;
};

const NONE: OrderCustoms = { declaration: null, warnings: [], needsAesFiling: false, dutyDowngraded: false };

/**
 * Build the declaration for an order, or NONE when it isn't crossing a border.
 *
 * Returning null for a domestic shipment matters as much as building one for an international
 * shipment: attaching a declaration to a domestic label is its own kind of broken.
 */
export async function customsForOrder(opts: {
 storeSlug: string;
 sellerName: string;
 itemId: string | null | undefined;
 fromCountry: string;
 toCountry: string;
 parcelWeightOz: number;
 /** Falls back to the order's own amount when the item has since been edited or removed. */
 fallbackValueCents?: number;
 fallbackTitle?: string;
}): Promise<OrderCustoms> {
 if (!isInternational(opts.fromCountry, opts.toCountry)) return NONE;

 const item = opts.itemId ? await getItem(opts.itemId).catch(() => null) : null;
 const title = item?.title || opts.fallbackTitle || "Second-hand clothing";
 const priceCents = item?.priceCents ?? opts.fallbackValueCents ?? 0;

 const shipping = await getShippingSettings(opts.storeSlug).catch(() => null);
 // A store may only promise "duties covered" when the carrier bills IT, not VYA — see
 // resolveDutyMode. On the shared wallet this silently becomes buyer-pays, and `dutyDowngraded`
 // says so, because a seller who thinks she's covering duty will say so on her storefront.
 const { mode: dutyMode, downgraded: dutyDowngraded } = resolveDutyMode(
  shipping?.dutyMode ?? DEFAULT_DUTY_MODE,
  Boolean(shipping?.carrierAccountId),
 );

 const declaration = buildDeclaration({
  items: [{
   title,
   category: item?.category ?? null,
   priceCents,
   hsCode: (item as { hsCode?: string | null } | null)?.hsCode ?? null,
   originCountry: (item as { originCountry?: string | null } | null)?.originCountry ?? null,
  }],
  fromCountry: opts.fromCountry,
  dutyMode,
  signer: opts.sellerName,
  parcelWeightOz: opts.parcelWeightOz,
 });

 // Read the description too — "crocodile" is as likely to be in the body as the title.
 const warnings = restrictedMaterials(`${title} ${item?.description ?? ""} ${item?.material ?? ""}`);

 return { declaration, warnings, needsAesFiling: declaration.eelPfc === null, dutyDowngraded };
}
