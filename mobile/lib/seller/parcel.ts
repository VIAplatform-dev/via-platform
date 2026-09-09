// The parcel a piece ships as — the phone's mirror of app/lib/parcel-core.ts. Pure.
//
// The tier thresholds are COPIED from app/lib/shipping-tiers.ts (small ≤ 16 oz, medium ≤ 48 oz);
// parcel.test.ts pins them. The category table is the server's, matched by a few words because the
// phone has no category taxonomy of its own.

export type TierId = "small" | "medium" | "large";
export type ParcelEstimate = { tier: TierId; weightOz: number; lengthIn?: number; widthIn?: number; heightIn?: number; source: "ai" | "category" };

export const TIERS: { id: TierId; maxWeightOz: number }[] = [
  { id: "small", maxWeightOz: 16 },
  { id: "medium", maxWeightOz: 48 },
  { id: "large", maxWeightOz: Infinity },
];

export function tierForWeight(weightOz: number | null | undefined): TierId | null {
  const w = Number(weightOz);
  if (!Number.isFinite(w) || w <= 0) return null;
  return (TIERS.find((t) => w <= t.maxWeightOz) ?? TIERS[TIERS.length - 1]).id;
}

// [pattern, packed ounces, the word for the warning]
const CATEGORIES: [RegExp, number, string | null][] = [
  [/coat|jacket|blazer|parka|trench|outerwear/i, 52, "a coat"],
  [/boot/i, 56, "a boot"],
  [/sneaker|trainer/i, 34, null],
  [/sweater|knit|cardigan|jumper/i, 24, "a knit"],
  [/dress|gown/i, 18, "a dress"],
  [/jumpsuit|romper/i, 20, null],
  [/jeans|denim/i, 26, "jeans"],
  [/pant|trouser/i, 22, "trousers"],
  [/skirt/i, 14, null],
  [/short/i, 12, null],
  [/heel|pump|loafer|shoe/i, 24, null],
  [/flat|ballet/i, 20, null],
  [/sandal/i, 16, null],
  [/tote/i, 30, "a bag"],
  [/clutch/i, 12, "a bag"],
  [/crossbody/i, 20, "a bag"],
  [/handbag|\bbag/i, 28, "a bag"],
  [/scarf|scarves/i, 6, "a scarf"],
  [/jewel|ring|earring|necklace|bracelet|brooch/i, 6, "jewellery"],
  [/belt|sunglass|accessor/i, 8, null],
  [/hat|cap|beret/i, 10, null],
  [/swim|bikini/i, 8, null],
  [/lingerie|bra\b|slip/i, 6, null],
  [/top|blouse|shirt|tee|t-shirt|vest|cami/i, 10, "a top"],
];
const UNKNOWN_OZ = 20;

function match(category: string | null | undefined): [number, string | null] {
  const c = String(category ?? "");
  const hit = c ? CATEGORIES.find(([re]) => re.test(c)) : undefined;
  return hit ? [hit[1], hit[2]] : [UNKNOWN_OZ, null];
}

export function defaultParcelFor(category: string | null | undefined): { tier: TierId; weightOz: number } {
  const [weightOz] = match(category);
  return { tier: tierForWeight(weightOz) ?? "medium", weightOz };
}

export function parcelMismatch(args: { typedWeightOz: number | null | undefined; estimate: ParcelEstimate | null | undefined; category?: string | null }): { typedTier: TierId; estimatedTier: TierId; message: string } | null {
  const typedTier = tierForWeight(args.typedWeightOz);
  const est = args.estimate;
  if (!typedTier || !est || typedTier === est.tier) return null;
  const idx = (t: TierId) => TIERS.findIndex((x) => x.id === t);
  const under = idx(typedTier) < idx(est.tier);
  const [, looks] = match(args.category);
  const what = looks ? `${looks} (${est.tier} parcel)` : `a ${est.tier} parcel`;
  const message = under
    ? `You typed ${args.typedWeightOz} oz, but this looks like ${what}. Buyers get quoted the ${typedTier} tier and you pay the difference.`
    : `You typed ${args.typedWeightOz} oz, but this looks like ${what}. Buyers get quoted the ${typedTier} tier — that's more than it needs.`;
  return { typedTier, estimatedTier: est.tier, message };
}

/** "Medium parcel · ~2 lb" · "Small parcel · 8 oz". */
export function describeParcel(tier: TierId, weightOz: number | null | undefined): string {
  const label = `${tier.charAt(0).toUpperCase()}${tier.slice(1)} parcel`;
  const w = Number(weightOz);
  if (!Number.isFinite(w) || w <= 0) return label;
  if (w < 16) return `${label} · ${w} oz`;
  return `${label} · ~${Math.round((w / 16) * 10) / 10} lb`;
}

/** The intake's `draft.parcel` → an estimate. Weight alone decides the tier here; the server also
 *  weighs girth, and its estimate on the saved item is what the edit form later reads. */
export function parcelEstimateFrom(raw: unknown): ParcelEstimate | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const n = (v: unknown) => { const x = Math.ceil(Number(v)); return Number.isFinite(x) && x > 0 ? x : null; };
  const weightOz = n(p.weightOz);
  if (weightOz == null) return null;
  const girth = (n(p.lengthIn) ?? 0) + (n(p.widthIn) ?? 0) + (n(p.heightIn) ?? 0);
  const byWeight = tierForWeight(weightOz) ?? "medium";
  const byGirth: TierId = girth <= 24 ? "small" : girth <= 40 ? "medium" : "large";
  const idx = (t: TierId) => TIERS.findIndex((x) => x.id === t);
  const tier = idx(byWeight) >= idx(byGirth) ? byWeight : byGirth;
  return { tier, weightOz, ...(n(p.lengthIn) != null ? { lengthIn: n(p.lengthIn)! } : {}), ...(n(p.widthIn) != null ? { widthIn: n(p.widthIn)! } : {}), ...(n(p.heightIn) != null ? { heightIn: n(p.heightIn)! } : {}), source: "ai" };
}
