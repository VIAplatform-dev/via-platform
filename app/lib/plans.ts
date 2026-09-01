// ───────────────────────────────────────────────────────────────────────────
// getvya.ai subscription tiers — the single source of truth for the seller plans.
//
// THIS IS FOR THE getvya.ai OPERATING SYSTEM ONLY. It does NOT gate the
// vyaplatform.com marketplace (that stays commission-based, no paywall).
//
// Model (decided 2026-08-01): 3 paid tiers, no free tier, a 30-day free trial on
// signup, and an ~25% discount for an annual commitment. Prices are NOT hardcoded —
// each tier+interval maps to a Stripe **Price ID** in an env var, so the amount is
// set once in Stripe (the UI reads the live number). Set the number whenever it's
// decided; the plumbing doesn't care what it is.
//
// EDIT ME: tier names, taglines, and the feature→tier assignment below are a
// starting strawman. Change them freely — the rest of the app reads from here.
// ───────────────────────────────────────────────────────────────────────────

export const TRIAL_DAYS = 30;
export const ANNUAL_DISCOUNT_PCT = 25; // display hint; the real saving is baked into the annual Stripe Price

export type Interval = "month" | "year";
export type TierId = "starter" | "studio" | "atelier";

export type Tier = {
 id: TierId;
 name: string;
 tagline: string;
 order: number; // 1 = lowest. Higher tiers include every lower tier's features.
};

export const TIERS: Tier[] = [
 { id: "starter", name: "Starter", tagline: "Run one store, end to end.", order: 1 },
 { id: "studio", name: "Studio", tagline: "Sell everywhere, on your own domain.", order: 2 },
 { id: "atelier", name: "Pro", tagline: "The full intelligence + consignment suite.", order: 3 },
];

export const TIER_ORDER: Record<TierId, number> = { starter: 1, studio: 2, atelier: 3 };

/**
 * How many people can be in a store's workspace, by tier.
 *
 * Counts the OWNER. "2 seats" means the owner plus one other person, which is how a seller reads it
 * — a limit that excluded the owner would let a Starter store have three logins and feel like a bug.
 *
 * A store with no live tier (free, or a lapsed subscription) keeps one seat, so the owner is never
 * locked out of her own store by a billing problem. Losing access to your inventory because a card
 * expired is not a downgrade, it's an outage.
 */
export const SEATS_BY_TIER: Record<TierId, number> = {
 starter: 2,
 studio: 4,
 atelier: 6,
};

export const FREE_SEATS = 1;

export function seatsForTier(tierId: TierId | null | undefined): number {
 return tierId ? SEATS_BY_TIER[tierId] ?? FREE_SEATS : FREE_SEATS;
}

/** Whether one more person can be added, and what to say when they can't. */
export function canAddSeat(tierId: TierId | null | undefined, currentCount: number): { ok: true } | { ok: false; limit: number; reason: string } {
 const limit = seatsForTier(tierId);
 if (currentCount < limit) return { ok: true };
 const nextId: TierId | null = tierId === "starter" ? "studio" : tierId === "studio" ? "atelier" : null;
 const next = nextId ? TIERS.find((t) => t.id === nextId)?.name ?? null : null;
 return {
  ok: false,
  limit,
  reason: next
   ? `Your plan includes ${limit} ${limit === 1 ? "seat" : "seats"}. Upgrade to ${next} for more.`
   : `Your plan includes ${limit} seats. Get in touch if you need more.`,
 };
}

export function getTier(id: string | null | undefined): Tier | null {
 return TIERS.find((t) => t.id === id) ?? null;
}

// ── Feature gating ──────────────────────────────────────────────────────────
// Each gateable feature maps to the MINIMUM tier order that unlocks it. A store
// on tier N gets every feature whose min-tier ≤ N. Reference these keys wherever
// you gate a workspace feature (via storeHasFeature in store-plans-db.ts).
// EDIT ME: move features between tiers to shape what each plan is worth.
export const FEATURE_MIN_TIER = {
 // Tier 1 — Starter: the essentials to run a single store on VYA.
 storefront: 1,
 inventory: 1,
 listings: 1,
 orders: 1,
 checkout: 1,
 email_campaigns: 1,
 customers: 1,
 inbox_offers: 1,
 // Tier 2 — Studio: reach + your own brand.
 cross_listing: 2,
 custom_domain: 2,
 automations: 2,
 instagram_autopost: 2,
 demand_intelligence: 2, // Source Now, demand search, market benchmarks
 // Tier 3 — Pro (id `atelier`): the deep intelligence + consignment operation.
 consignment: 3,
 culture_trends: 3,
 sourcing_alerts: 3,
 price_benchmarks: 3,
 priority_support: 3,
} as const;

export type Feature = keyof typeof FEATURE_MIN_TIER;

/** Human labels + the tier each feature belongs to — used to render the plan cards. */
export const FEATURE_LABELS: Record<Feature, string> = {
 storefront: "Storefront builder + hosting",
 inventory: "One-of-one inventory",
 listings: "AI listing + pricing",
 orders: "Orders + fulfillment",
 checkout: "Native checkout + shipping labels",
 email_campaigns: "Email campaigns + designer",
 customers: "Customers (360 profiles)",
 inbox_offers: "Inbox, offers + binding checkout",
 cross_listing: "Cross-listing (eBay, Etsy…)",
 custom_domain: "Custom domain",
 automations: "Marketing automations",
 instagram_autopost: "Instagram auto-post",
 demand_intelligence: "Demand intelligence (Source Now)",
 consignment: "Consignment suite",
 culture_trends: "Culture trends",
 sourcing_alerts: "Sourcing alerts",
 price_benchmarks: "Price benchmarks",
 priority_support: "Priority support",
};

/** True if a tier unlocks a feature (cumulative — higher tiers include lower ones). */
export function tierIncludesFeature(tierId: TierId, feature: Feature): boolean {
 return TIER_ORDER[tierId] >= FEATURE_MIN_TIER[feature];
}

/** The ordered feature keys a tier unlocks — for rendering "what's included". */
export function featuresForTier(tierId: TierId): Feature[] {
 return (Object.keys(FEATURE_MIN_TIER) as Feature[]).filter((f) => tierIncludesFeature(tierId, f));
}

// ── Stripe Price IDs (env-driven; set when the prices are finalized) ─────────
// Env var per tier+interval, e.g. STRIPE_PRICE_STUDIO_MONTHLY / STRIPE_PRICE_STUDIO_ANNUAL.
export function priceEnvName(tierId: TierId, interval: Interval): string {
 return `STRIPE_PRICE_${tierId.toUpperCase()}_${interval === "year" ? "ANNUAL" : "MONTHLY"}`;
}

export function priceIdFor(tierId: TierId, interval: Interval): string | null {
 return process.env[priceEnvName(tierId, interval)]?.trim() || null;
}

/** Reverse lookup: given a Stripe Price ID (from a webhook), which tier+interval is it? */
export function tierForPriceId(priceId: string): { tierId: TierId; interval: Interval } | null {
 for (const t of TIERS) {
  for (const interval of ["month", "year"] as Interval[]) {
   if (priceIdFor(t.id, interval) === priceId) return { tierId: t.id, interval };
  }
 }
 return null;
}

/** True once at least one tier has a configured Price ID (so the plan page can render). */
export function plansConfigured(): boolean {
 return TIERS.some((t) => priceIdFor(t.id, "month") || priceIdFor(t.id, "year"));
}
