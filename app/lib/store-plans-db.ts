import { neon } from "@neondatabase/serverless";
import { type TierId, type Feature, type Interval, TIER_ORDER, tierIncludesFeature } from "./plans.ts";  // ".ts" so `node --test` can load this tree — strip-only TS needs the extension

// Per-store subscription plan for the getvya.ai operating system. A store subscribes
// to one of 3 paid tiers (starter/studio/atelier, see plans.ts) with a 30-day trial.
// `tier` drives feature gating; `plan` ("free"|"pro") is kept for back-compat with
// older Pro gates (any active tier ⇒ "pro"). Stripe fields back the subscription.
// This is the getvya.ai OS subscription — NOT the vyaplatform.com marketplace.

const ACTIVE_STATUSES = ["active", "trialing", "past_due"]; // trial + grace count as entitled
const DEAD_STATUSES = ["canceled", "unpaid", "incomplete_expired", "incomplete"];

export type StorePlan = {
 storeSlug: string;
 plan: "free" | "pro";
 tier: TierId | null;
 interval: Interval | null;
 status: string | null; // stripe subscription status (active, trialing, past_due, canceled…)
 stripeCustomerId: string | null;
 stripeSubscriptionId: string | null;
 currentPeriodEnd: string | null;
 updatedAt: string;
};

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

let ensured = false;
async function ensureTable() {
 if (ensured) return;
 const sql = db();
 await sql`
 CREATE TABLE IF NOT EXISTS store_plans (
  store_slug TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )
 `;
 // Self-healing migration for the tiered model.
 await sql`ALTER TABLE store_plans ADD COLUMN IF NOT EXISTS tier TEXT`.catch(() => {});
 await sql`ALTER TABLE store_plans ADD COLUMN IF NOT EXISTS interval TEXT`.catch(() => {});
 ensured = true;
}

function mapRow(r: Record<string, unknown>): StorePlan {
 return {
 storeSlug: r.store_slug as string,
 plan: (r.plan as "free" | "pro") ?? "free",
 tier: (r.tier as TierId | null) ?? null,
 interval: (r.interval as Interval | null) ?? null,
 status: (r.status as string | null) ?? null,
 stripeCustomerId: (r.stripe_customer_id as string | null) ?? null,
 stripeSubscriptionId: (r.stripe_subscription_id as string | null) ?? null,
 currentPeriodEnd:
  r.current_period_end instanceof Date
   ? (r.current_period_end as Date).toISOString()
   : (r.current_period_end as string | null) ?? null,
 updatedAt:
  r.updated_at instanceof Date ? (r.updated_at as Date).toISOString() : String(r.updated_at),
 };
}

const EMPTY = (storeSlug: string): StorePlan => ({
 storeSlug, plan: "free", tier: null, interval: null, status: null,
 stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null,
 updatedAt: new Date(0).toISOString(),
});

export async function getStorePlan(storeSlug: string): Promise<StorePlan> {
 await ensureTable();
 const sql = db();
 const rows = (await sql`SELECT * FROM store_plans WHERE store_slug = ${storeSlug} LIMIT 1`) as Array<Record<string, unknown>>;
 return rows.length === 0 ? EMPTY(storeSlug) : mapRow(rows[0]);
}

/** Whether a plan record is currently entitled (paid tier live, incl. trial/grace). */
function isEntitled(p: StorePlan): boolean {
 if (!p.tier) return false;
 if (p.status && DEAD_STATUSES.includes(p.status)) return false;
 if (p.status && !ACTIVE_STATUSES.includes(p.status)) return false;
 return true;
}

/** The store's current active tier id, or null (no active subscription/trial). */
export async function getStoreTier(storeSlug: string): Promise<TierId | null> {
 if (storeSlug === "via-admin") return "atelier"; // owner test account gets the top tier
 const p = await getStorePlan(storeSlug);
 return isEntitled(p) ? p.tier : null;
}

/** Tier-aware feature gate — the canonical check for workspace features. */
export async function storeHasFeature(storeSlug: string, feature: Feature): Promise<boolean> {
 if (storeSlug === "via-admin") return true;
 const tier = await getStoreTier(storeSlug);
 return tier ? tierIncludesFeature(tier, feature) : false;
}

/** Back-compat: existing Pro gates. Any active paid tier reads as "pro". */
export async function isStorePro(storeSlug: string): Promise<boolean> {
 if (storeSlug === "via-admin") return true;
 return (await getStoreTier(storeSlug)) !== null;
}

/** Rank of the store's tier (0 = none), for "needs at least tier N" comparisons. */
export async function storeTierRank(storeSlug: string): Promise<number> {
 const tier = await getStoreTier(storeSlug);
 return tier ? TIER_ORDER[tier] : 0;
}

/** Upsert the plan record (called from the Stripe webhook on subscription changes). */
export async function setStorePlan(
 storeSlug: string,
 fields: Partial<Omit<StorePlan, "storeSlug" | "updatedAt">>,
): Promise<void> {
 await ensureTable();
 const sql = db();
 const cur = await getStorePlan(storeSlug);
 const tier = fields.tier !== undefined ? fields.tier : cur.tier;
 const interval = fields.interval !== undefined ? fields.interval : cur.interval;
 const status = fields.status ?? cur.status;
 // Derive plan for back-compat: an entitled tier ⇒ "pro", else "free".
 const derivedPlan =
  tier && !(status && DEAD_STATUSES.includes(status)) ? "pro" : "free";
 const plan = fields.plan ?? derivedPlan;
 const stripeCustomerId = fields.stripeCustomerId ?? cur.stripeCustomerId;
 const stripeSubscriptionId = fields.stripeSubscriptionId ?? cur.stripeSubscriptionId;
 const currentPeriodEnd = fields.currentPeriodEnd ?? cur.currentPeriodEnd;
 await sql`
 INSERT INTO store_plans (store_slug, plan, tier, interval, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at)
 VALUES (${storeSlug}, ${plan}, ${tier}, ${interval}, ${status}, ${stripeCustomerId}, ${stripeSubscriptionId}, ${currentPeriodEnd}, NOW())
 ON CONFLICT (store_slug) DO UPDATE SET
  plan = EXCLUDED.plan,
  tier = EXCLUDED.tier,
  interval = EXCLUDED.interval,
  status = EXCLUDED.status,
  stripe_customer_id = EXCLUDED.stripe_customer_id,
  stripe_subscription_id = EXCLUDED.stripe_subscription_id,
  current_period_end = EXCLUDED.current_period_end,
  updated_at = NOW()
 `;
}
