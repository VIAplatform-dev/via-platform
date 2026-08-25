import { neon } from "@neondatabase/serverless";
import { getStorePlan } from "./store-plans-db.ts";
import { AI_LISTINGS_PER_PERIOD, TRIAL_AI_LISTINGS, type TierId } from "./plans.ts";

// ───────────────────────────────────────────────────────────────────────────
// How many AI listings a store has used this billing period, and whether it may have another.
//
// The period is keyed on the store's own Stripe `currentPeriodEnd`. That means the allowance resets
// exactly when the subscription renews — on the store's own anniversary, not the 1st — with no cron
// job, no month arithmetic, and no drift between what we count and what they were billed for. A
// renewal simply produces a new period key, and a new key starts at zero.
//
// A store with no subscription (or one Stripe hasn't told us about yet) falls back to the calendar
// month, so counting never silently stops.
// ───────────────────────────────────────────────────────────────────────────

function db() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL");
 return neon(url);
}

let ensured = false;
async function ensureTable(): Promise<void> {
 if (ensured) return;
 await db()`
  CREATE TABLE IF NOT EXISTS store_ai_usage (
   store_slug TEXT NOT NULL,
   period_key TEXT NOT NULL,
   used INT NOT NULL DEFAULT 0,
   updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   PRIMARY KEY (store_slug, period_key)
  )
 `.catch(() => {});
 ensured = true;
}

export type AiAllowance = {
 tier: TierId | null;
 trialing: boolean;
 used: number;
 limit: number;
 remaining: number;
 periodKey: string;
 /** False once the allowance is gone. Manual listing is unaffected — only the AI stops. */
 allowed: boolean;
};

/** The billing period this moment belongs to, from Stripe when we know it. */
export function periodKeyFrom(currentPeriodEnd: string | null): string {
 if (currentPeriodEnd) {
  const d = new Date(currentPeriodEnd);
  if (!Number.isNaN(d.getTime())) return `sub:${d.toISOString().slice(0, 10)}`;
 }
 return `cal:${new Date().toISOString().slice(0, 7)}`;
}

export function limitFor(tier: TierId | null, trialing: boolean): number {
 if (trialing) return TRIAL_AI_LISTINGS;
 return tier ? AI_LISTINGS_PER_PERIOD[tier] : 0;
}

/** Read-only: what's left, for the UI and for the end-of-trial tier recommendation. */
export async function getAiAllowance(storeSlug: string): Promise<AiAllowance> {
 await ensureTable();
 const plan = await getStorePlan(storeSlug).catch(() => null);
 const trialing = plan?.status === "trialing";
 const tier = plan?.tier ?? null;
 const periodKey = periodKeyFrom(plan?.currentPeriodEnd ?? null);
 const limit = limitFor(tier, trialing);
 const rows = (await db()`
  SELECT used FROM store_ai_usage WHERE store_slug = ${storeSlug} AND period_key = ${periodKey}
 `.catch(() => [])) as Array<{ used: number }>;
 const used = Number(rows[0]?.used ?? 0);
 return { tier, trialing, used, limit, remaining: Math.max(0, limit - used), periodKey, allowed: used < limit };
}

/**
 * Claim one AI listing.
 *
 * The increment and the limit check are ONE statement, so two uploads racing each other cannot both
 * see 49-of-50 and both proceed. Bulk upload runs three items concurrently, so this is a real race,
 * not a theoretical one.
 *
 * Call this BEFORE the expensive work. Refusing after the model calls have run means paying for the
 * listing you're declining to give them.
 */
export async function claimAiListing(storeSlug: string): Promise<AiAllowance> {
 await ensureTable();
 const before = await getAiAllowance(storeSlug);
 if (!before.allowed) return before;

 const rows = (await db()`
  INSERT INTO store_ai_usage (store_slug, period_key, used, updated_at)
  VALUES (${storeSlug}, ${before.periodKey}, 1, now())
  ON CONFLICT (store_slug, period_key) DO UPDATE
   SET used = store_ai_usage.used + 1, updated_at = now()
   WHERE store_ai_usage.used < ${before.limit}
  RETURNING used
 `.catch(() => [])) as Array<{ used: number }>;

 // No row back means the guard in the WHERE clause rejected it: someone else took the last one.
 if (!rows.length) return { ...before, used: before.limit, remaining: 0, allowed: false };
 const used = Number(rows[0].used);
 return { ...before, used, remaining: Math.max(0, before.limit - used), allowed: true };
}

/** Give a claim back when the work failed, so a crash doesn't cost the seller a listing. */
export async function refundAiListing(storeSlug: string, periodKey: string): Promise<void> {
 await ensureTable();
 await db()`
  UPDATE store_ai_usage SET used = GREATEST(0, used - 1), updated_at = now()
  WHERE store_slug = ${storeSlug} AND period_key = ${periodKey}
 `.catch(() => {});
}
