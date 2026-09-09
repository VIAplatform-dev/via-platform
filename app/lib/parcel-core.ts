// The parcel a piece ships as. Pure — no I/O.
//
// Buyers are quoted a flat tier by weight and girth (shipping-tiers.ts). An unweighed piece used to
// land on the intake's "16 oz, 12×9×3" fallback, which is a SMALL parcel — so a coat nobody weighed
// was quoted the small tier and the seller paid the difference at the counter. This module fills
// the gap honestly: the AI's estimate when it made one, a short per-category default when it
// didn't, and a warning when what she typed lands in a different tier from what the piece looks
// like.

import { SHIPPING_TIERS, assignTier, type TierId } from "./shipping-tiers.ts";
import { toCategorySlug } from "./item-tags.ts";

export type ParcelEstimate = {
 tier: TierId;
 weightOz: number;
 lengthIn?: number;
 widthIn?: number;
 heightIn?: number;
 /** `ai` = the intake model judged this piece; `category` = a table default, nobody looked. */
 source: "ai" | "category";
};

type TierLike = { id: TierId; maxWeightOz: number };

/** Which tier a weight alone lands in. Null for no weight — that is "unknown", not "small". */
export function tierForWeight(weightOz: number | null | undefined, tiers: TierLike[] = SHIPPING_TIERS): TierId | null {
 const w = Number(weightOz);
 if (!Number.isFinite(w) || w <= 0) return null;
 return (tiers.find((t) => w <= t.maxWeightOz) ?? tiers[tiers.length - 1]).id;
}

// Packed weight, in ounces, by category. The ai-intake prompt's own guide ranges, taken at their
// middle. Deliberately short — a table nobody maintains is worse than the model's own judgment,
// which is used first whenever it exists.
const BY_SLUG: Record<string, number> = {
 "coats-jackets": 52,
 boots: 56,
 sweaters: 24, dresses: 18, jumpsuits: 20, skirts: 14, pants: 22, jeans: 26, shorts: 12, swimwear: 8, lingerie: 6, "other-clothing": 18,
 tops: 10,
 heels: 24, flats: 20, sandals: 16, sneakers: 34, shoes: 24,
 handbags: 28, totes: 30, clutches: 12, "crossbody-bags": 20, bags: 28,
 scarves: 6, belts: 8, hats: 10, sunglasses: 8, jewelry: 6, accessories: 8,
 home: 24,
};
const UNKNOWN_OZ = 20;

/** A tier and packed weight for a category. Unknown → the safe middle (medium), never small. */
export function defaultParcelFor(category: string | null | undefined): { tier: TierId; weightOz: number } {
 const slug = toCategorySlug(category);
 const weightOz = slug && BY_SLUG[slug] != null ? BY_SLUG[slug] : UNKNOWN_OZ;
 return { tier: tierForWeight(weightOz) ?? "medium", weightOz };
}

// Box dims that hold a parcel of each tier without pushing it up a tier on girth.
const BOX: Record<TierId, { lengthIn: number; widthIn: number; heightIn: number }> = {
 small: { lengthIn: 12, widthIn: 9, heightIn: 3 },
 medium: { lengthIn: 14, widthIn: 11, heightIn: 4 },
 large: { lengthIn: 16, widthIn: 12, heightIn: 6 },
};

/** The intake model's `draft.parcel` → an estimate; null when it isn't a parcel. */
export function parcelEstimateFrom(raw: unknown): ParcelEstimate | null {
 if (!raw || typeof raw !== "object") return null;
 const p = raw as Record<string, unknown>;
 const n = (v: unknown) => { const x = Math.ceil(Number(v)); return Number.isFinite(x) && x > 0 ? x : null; };
 const weightOz = n(p.weightOz);
 if (weightOz == null) return null;
 const lengthIn = n(p.lengthIn), widthIn = n(p.widthIn), heightIn = n(p.heightIn);
 const tier = assignTier({ weightOz, lengthIn, widthIn, heightIn }).id;
 return { tier, weightOz, ...(lengthIn != null ? { lengthIn } : {}), ...(widthIn != null ? { widthIn } : {}), ...(heightIn != null ? { heightIn } : {}), source: "ai" };
}

/** The tier as a buyer-facing word, when a category has one. */
function pieceWord(category: string | null | undefined): string | null {
 const slug = toCategorySlug(category);
 const words: Record<string, string> = { "coats-jackets": "a coat", boots: "a boot", sweaters: "a knit", dresses: "a dress", handbags: "a bag", totes: "a bag", jeans: "jeans", pants: "trousers", tops: "a top", scarves: "a scarf", jewelry: "jewellery" };
 return slug ? words[slug] ?? null : null;
}

/**
 * Only when the typed weight lands in a DIFFERENT tier from the estimate. Same tier, no weight, or
 * no estimate → nothing to say.
 */
export function parcelMismatch(args: { typedWeightOz: number | null | undefined; estimate: ParcelEstimate | null | undefined; category?: string | null }): { typedTier: TierId; estimatedTier: TierId; message: string } | null {
 const typedTier = tierForWeight(args.typedWeightOz);
 const est = args.estimate;
 if (!typedTier || !est) return null;
 if (typedTier === est.tier) return null;
 const idx = (t: TierId) => SHIPPING_TIERS.findIndex((x) => x.id === t);
 const under = idx(typedTier) < idx(est.tier);
 const looks = pieceWord(args.category);
 const message = under
  ? `You typed ${args.typedWeightOz} oz, but this looks like ${looks ? `${looks} (${est.tier} parcel)` : `a ${est.tier} parcel`}. Buyers get quoted the ${typedTier} tier and you pay the difference.`
  : `You typed ${args.typedWeightOz} oz, but this looks like ${looks ? `${looks} (${est.tier} parcel)` : `a ${est.tier} parcel`}. Buyers get quoted the ${typedTier} tier — that's more than it needs.`;
 return { typedTier, estimatedTier: est.tier, message };
}

/** "Medium parcel · ~2 lb" · "Small parcel · 8 oz". */
export function describeParcel(tier: TierId, weightOz: number | null | undefined): string {
 const label = `${tier.charAt(0).toUpperCase()}${tier.slice(1)} parcel`;
 const w = Number(weightOz);
 if (!Number.isFinite(w) || w <= 0) return label;
 if (w < 16) return `${label} · ${w} oz`;
 const lb = Math.round((w / 16) * 10) / 10;
 return `${label} · ~${lb} lb`;
}

/**
 * The parcel to store at publish. Typed values win field by field; then the AI's estimate; then the
 * category default in a box sized for its tier. The estimate is returned for keeping on the item
 * so the edit form can warn later when a typed weight disagrees with it.
 */
export function resolveParcelAtPublish(args: {
 typed: { weightOz?: unknown; lengthIn?: unknown; widthIn?: unknown; heightIn?: unknown };
 aiParcel: unknown;
 category: string | null | undefined;
}): { parcel: { weightOz: number; lengthIn: number; widthIn: number; heightIn: number }; estimate: ParcelEstimate | null } {
 const up = (v: unknown) => { const n = Math.ceil(Number(v)); return Number.isFinite(n) && n > 0 ? n : null; };
 const ai = parcelEstimateFrom(args.aiParcel);
 const estimate: ParcelEstimate | null = ai ?? (() => {
  const d = defaultParcelFor(args.category);
  return { ...d, ...BOX[d.tier], source: "category" as const };
 })();
 const box = BOX[estimate?.tier ?? "medium"];
 const parcel = {
  weightOz: up(args.typed.weightOz) ?? estimate?.weightOz ?? UNKNOWN_OZ,
  lengthIn: up(args.typed.lengthIn) ?? estimate?.lengthIn ?? box.lengthIn,
  widthIn: up(args.typed.widthIn) ?? estimate?.widthIn ?? box.widthIn,
  heightIn: up(args.typed.heightIn) ?? estimate?.heightIn ?? box.heightIn,
 };
 return { parcel, estimate };
}

/**
 * The parcel to buy a label for.
 *
 * This used to be `order.itemWeightOz || 16` with 12×9×3 behind it — so a piece that reached the
 * order without dimensions bought a small-mailer label regardless of what it was. A massive bag
 * shipped on a 16oz label: the carrier either refuses it at the counter or bills the adjustment
 * back weeks later, and either way the store finds out after the fact.
 *
 * The buyer already told us how big it is. They paid a tier — Small, Medium or Large — and that
 * tier is a floor the label may not go under. So: use the piece's own measurements where it has
 * them, and where it doesn't, fall back to the tier that was PAID FOR rather than to a guess. Where
 * a piece has measurements that disagree with the tier, take the larger of the two; a heavy coat
 * that somehow got listed at 4oz should not buy a 4oz label.
 */
export function parcelForLabel(args: {
 item: { weightOz?: number | null; lengthIn?: number | null; widthIn?: number | null; heightIn?: number | null };
 /** What the buyer actually paid for shipping, in cents — maps back to the tier they bought. */
 shippingPaidCents?: number | null;
}): { weightOz: number; lengthIn: number; widthIn: number; heightIn: number } {
 const paid = Number(args.shippingPaidCents) || 0;
 // The most expensive tier the payment covers: what the buyer bought, and our floor.
 const paidTier = paid > 0
  ? [...SHIPPING_TIERS].reverse().find((t) => paid >= t.priceCents)?.id ?? "small"
  : null;

 const num = (v: unknown) => { const n = Math.ceil(Number(v)); return Number.isFinite(n) && n > 0 ? n : null; };
 const w = num(args.item.weightOz);
 const l = num(args.item.lengthIn), wd = num(args.item.widthIn), h = num(args.item.heightIn);

 // With no tier to lean on either, "medium" is the honest default — the middle of the ladder, not
 // the bottom of it. Under-buying is the expensive mistake; over-buying costs pennies.
 const floorTier: TierId = paidTier ?? "medium";
 const floorBox = BOX[floorTier];
 // Two different jobs, and conflating them over-buys. When the weight is UNKNOWN we buy the top of
 // the tier, because that's the heaviest thing the buyer's payment could have been for. When it is
 // KNOWN we trust it, but not below the tier's own floor — so a genuine 90oz coat buys 90oz, while
 // one mis-typed as 4oz still buys a Large parcel.
 const unknownWeight = floorTier === "small" ? 16 : floorTier === "medium" ? 48 : 96;
 const minWeight = floorTier === "small" ? 1 : floorTier === "medium" ? 17 : 49;

 // Item dims win only when they're at least as big as the floor, so a missing or nonsense
 // measurement can never shrink the parcel below what was paid for.
 return {
  weightOz: w == null ? unknownWeight : Math.max(w, minWeight),
  lengthIn: Math.max(l ?? 0, floorBox.lengthIn),
  widthIn: Math.max(wd ?? 0, floorBox.widthIn),
  heightIn: Math.max(h ?? 0, floorBox.heightIn),
 };
}

/**
 * One box for a whole checkout.
 *
 * Orders are one row per piece, and the label was bought per row from that row's measurements — so
 * a t-shirt and a large bag bought together produced two labels, each sized for its own item. In
 * practice the seller packs them in one box and sticks on whichever label she clicked, which is
 * the t-shirt's. The parcel has to describe what is actually being posted.
 *
 * Weight adds up. Dimensions don't: things go IN a box, they don't queue end to end. Clothing packs
 * flat and stacks, so the box is as long and wide as its largest item and as tall as the stack —
 * max, max, sum. That errs slightly large, which is the safe direction: an over-declared parcel
 * costs a little more, an under-declared one gets refused or billed back.
 */
export function combineParcels(
 items: { weightOz?: number | null; lengthIn?: number | null; widthIn?: number | null; heightIn?: number | null }[],
 opts: { shippingPaidCents?: number | null } = {},
): { weightOz: number; lengthIn: number; widthIn: number; heightIn: number } {
 const real = (items || []).filter(Boolean);
 if (!real.length) return parcelForLabel({ item: {}, shippingPaidCents: opts.shippingPaidCents });
 if (real.length === 1) return parcelForLabel({ item: real[0], shippingPaidCents: opts.shippingPaidCents });

 // Add up what the pieces actually are. The floor is applied ONCE, to the total — applying it per
 // item would make three t-shirts weigh more than a coat, because each would be rounded up to the
 // middle of the ladder before anything was added together.
 const num = (v: unknown, fallback: number) => { const n = Math.ceil(Number(v)); return Number.isFinite(n) && n > 0 ? n : fallback; };
 const summed = real.reduce<{ weightOz: number; lengthIn: number; widthIn: number; heightIn: number }>(
  (acc, it) => ({
   // A piece with nothing recorded still takes up room in the box: the same unknown weight the
   // category default uses, in a modest flat footprint.
   weightOz: acc.weightOz + num(it.weightOz, UNKNOWN_OZ),
   lengthIn: Math.max(acc.lengthIn, num(it.lengthIn, 12)),
   widthIn: Math.max(acc.widthIn, num(it.widthIn, 9)),
   heightIn: acc.heightIn + num(it.heightIn, 2),
  }),
  { weightOz: 0, lengthIn: 0, widthIn: 0, heightIn: 0 },
 );

 // …then the same floor a single label gets, so a combined parcel can't come out under what the
 // buyer paid either.
 return parcelForLabel({ item: summed, shippingPaidCents: opts.shippingPaidCents });
}
