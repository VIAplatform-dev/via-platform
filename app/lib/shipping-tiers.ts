// Central shipping config. VYA charges the BUYER a clean FLAT rate by parcel size, buys the real
// discounted carrier label (Shippo) behind the scenes at fulfillment, and keeps the spread. Tiers
// live HERE ONLY — never hardcode a shipping price anywhere else. `typicalCostCents` is the rough
// real Shippo label range per tier; tune every number here from actual captured label costs over time.

export type TierId = "small" | "medium" | "large";

export type ShippingTier = {
 id: TierId;
 label: string;
 priceCents: number; // what the BUYER pays (flat, VYA-set)
 maxWeightOz: number; // upper weight bound; Infinity for the top tier
 maxGirthIn: number; // upper L+W+H bound — a light-but-bulky coat still lands in a bigger tier
 typicalCostCents: [number, number]; // rough real discounted label range, for the margin readout
 examples: string;
};

export const SHIPPING_TIERS: ShippingTier[] = [
 { id: "small", label: "Small", priceCents: 800, maxWeightOz: 16, maxGirthIn: 24, typicalCostCents: [500, 650], examples: "Scarves, jewelry, small bags, light tops" },
 { id: "medium", label: "Medium", priceCents: 1400, maxWeightOz: 48, maxGirthIn: 40, typicalCostCents: [850, 1150], examples: "Dresses, most clothing, shoes, mid-size bags" },
 { id: "large", label: "Large", priceCents: 2400, maxWeightOz: Infinity, maxGirthIn: Infinity, typicalCostCents: [1600, 2200], examples: "Coats, boots, heavy knits, multi-item orders" },
];

// The margin VYA must clear on every order. If a parcel's real label would eat the flat rate (a
// heavy/cross-country outlier), the buyer's charge is floored at (real cost + this) so VYA never
// ships at a loss. Small/Medium tiers always clear this comfortably; only Large is ever at risk.
export const MIN_MARGIN_CENTS = 250;

export type ParcelDims = { weightOz?: number | null; lengthIn?: number | null; widthIn?: number | null; heightIn?: number | null };

const idx = (t: ShippingTier) => SHIPPING_TIERS.indexOf(t);

/**
 * Pick the tier for a parcel: the LARGER of its weight tier and its size (girth) tier — so a light
 * but bulky coat is never underpriced. Unknown/empty dimensions default to Medium (the safe middle),
 * which is why intake-captured weight+dims matter: with them, the tier is assigned automatically.
 */
export function assignTier(p?: ParcelDims | null): ShippingTier {
 if (!p) return SHIPPING_TIERS[1];
 const w = Number(p.weightOz) || 0;
 const girth = (Number(p.lengthIn) || 0) + (Number(p.widthIn) || 0) + (Number(p.heightIn) || 0);
 if (!w && !girth) return SHIPPING_TIERS[1];
 const byWeight = SHIPPING_TIERS.find((t) => w <= t.maxWeightOz) ?? SHIPPING_TIERS[SHIPPING_TIERS.length - 1];
 const byGirth = SHIPPING_TIERS.find((t) => girth <= t.maxGirthIn) ?? SHIPPING_TIERS[SHIPPING_TIERS.length - 1];
 return idx(byWeight) >= idx(byGirth) ? byWeight : byGirth;
}

/** The flat price the buyer pays for a parcel (the assigned tier's price). */
export function flatRateCents(p?: ParcelDims | null): number {
 return assignTier(p).priceCents;
}

/**
 * What to actually charge the buyer, guaranteeing VYA never loses. Normally the clean flat tier — but
 * if we have a live label cost and the flat wouldn't clear MIN_MARGIN over it (a heavy/far outlier),
 * the charge is floored at cost + MIN_MARGIN. Pass `liveCheapestCents` only when it's worth checking
 * (the Large tier); omit it and the buyer just pays the flat rate.
 */
export function buyerChargeCents(p?: ParcelDims | null, liveCheapestCents?: number | null): number {
 const flat = flatRateCents(p);
 if (liveCheapestCents == null || liveCheapestCents <= 0) return flat;
 return Math.max(flat, liveCheapestCents + MIN_MARGIN_CENTS);
}

/** True when a tier's flat price could be eaten by a real label — i.e. worth a live floor check. */
export function tierNeedsFloorCheck(id: TierId): boolean {
 return id === "large";
}

/** VYA's margin once the real label is bought: what the buyer paid minus the actual label cost. */
export function shippingMarginCents(buyerPaidCents: number, realLabelCents: number): number {
 return Math.round(buyerPaidCents - realLabelCents);
}
