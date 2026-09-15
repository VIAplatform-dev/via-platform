import { estimateParcel } from "./parcel-estimate.ts";

// Central shipping config. VYA charges the BUYER a clean FLAT rate by parcel size, buys the real
// discounted carrier label (Shippo) behind the scenes at fulfillment, and keeps the spread. Tiers
// live HERE ONLY, never hardcode a shipping price anywhere else. `typicalCostCents` is the rough
// real Shippo label range per tier; tune every number here from actual captured label costs over time.

export type TierId = "small" | "medium" | "large";

export type ShippingTier = {
 id: TierId;
 label: string;
 priceCents: number; // what the BUYER pays (flat, VYA-set)
 maxWeightOz: number; // upper weight bound; Infinity for the top tier
 maxGirthIn: number; // upper L+W+H bound: a light-but-bulky coat still lands in a bigger tier
 typicalCostCents: [number, number]; // rough real discounted label range, for the margin readout
 examples: string;
};

export const SHIPPING_TIERS: ShippingTier[] = [
 { id: "small", label: "Small", priceCents: 800, maxWeightOz: 16, maxGirthIn: 24, typicalCostCents: [500, 650], examples: "Scarves, jewelry, small bags, light tops" },
 { id: "medium", label: "Medium", priceCents: 1400, maxWeightOz: 48, maxGirthIn: 40, typicalCostCents: [850, 1150], examples: "Dresses, most clothing, shoes, mid-size bags" },
 { id: "large", label: "Large", priceCents: 2400, maxWeightOz: Infinity, maxGirthIn: Infinity, typicalCostCents: [1600, 2200], examples: "Coats, boots, heavy knits, multi-item orders" },
];

// The margin VYA wants to clear on a typical order. Baked into each tier's flat price (buyer pays the
// flat tier, VYA buys the real discounted label and keeps the spread). Not a per-order floor: buyer
// pricing stays flat & consistent (Depop/Poshmark-style). This is also the loss-monitor threshold,
// when a real label lands within/over this margin, we alert ops so the tier can be re-tuned. Round-up
// dims (at intake) keep heavy items in the right tier so the flat price actually covers them.
export const MIN_MARGIN_CENTS = 250;

export type ParcelDims = {
 weightOz?: number | null; lengthIn?: number | null; widthIn?: number | null; heightIn?: number | null;
 /**
  * What the piece IS, for when nobody has measured it. Optional, so every existing caller keeps
  * behaving exactly as it did; pass them and an unmeasured piece is judged as the thing it is
  * rather than as the safe middle. See parcel-estimate.ts for why that matters at our ratio.
  */
 category?: string | null; title?: string | null;
};

const idx = (t: ShippingTier) => SHIPPING_TIERS.indexOf(t);

/**
 * Pick the tier for a parcel: the LARGER of its weight tier and its size (girth) tier, so a light
 * but bulky coat is never underpriced.
 *
 * MEASURED WINS, ALWAYS. Only when there is nothing measured at all does it fall back, and then to
 * an estimate from what the piece IS (parcel-estimate.ts) rather than straight to Medium. Medium is
 * still the answer when even that has nothing to go on. This ordering is the point: a tape measure
 * beats a guess about a category, and a guess about a category beats charging for earrings and a
 * shearling coat as though they were the same parcel.
 */
export function assignTier(p?: ParcelDims | null): ShippingTier {
 if (!p) return SHIPPING_TIERS[1];
 let w = Number(p.weightOz) || 0;
 let girth = (Number(p.lengthIn) || 0) + (Number(p.widthIn) || 0) + (Number(p.heightIn) || 0);
 if (!w && !girth) {
  const est = estimateParcel(p.category, p.title);
  if (!est) return SHIPPING_TIERS[1];
  w = est.weightOz;
  girth = est.lengthIn + est.widthIn + est.heightIn;
 }
 const byWeight = SHIPPING_TIERS.find((t) => w <= t.maxWeightOz) ?? SHIPPING_TIERS[SHIPPING_TIERS.length - 1];
 const byGirth = SHIPPING_TIERS.find((t) => girth <= t.maxGirthIn) ?? SHIPPING_TIERS[SHIPPING_TIERS.length - 1];
 return idx(byWeight) >= idx(byGirth) ? byWeight : byGirth;
}

/** The flat price the buyer pays for a parcel (the assigned tier's price). */
export function flatRateCents(p?: ParcelDims | null): number {
 return assignTier(p).priceCents;
}

/** VYA's margin once the real label is bought: what the buyer paid minus the actual label cost. */
export function shippingMarginCents(buyerPaidCents: number, realLabelCents: number): number {
 return Math.round(buyerPaidCents - realLabelCents);
}
