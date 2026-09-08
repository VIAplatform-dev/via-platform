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
