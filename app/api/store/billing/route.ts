import { NextRequest, NextResponse } from "next/server";
import { stripeGet, stripeConfigured } from "@/app/lib/stripe";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getStorePlan } from "@/app/lib/store-plans-db";
import {
 TIERS, TRIAL_DAYS, ANNUAL_DISCOUNT_PCT, plansConfigured,
 priceIdFor, featuresForTier, addedFeaturesForTier, FEATURE_LABELS, type Interval,
} from "@/app/lib/plans";

export const dynamic = "force-dynamic";

// Live price lookup from Stripe, so the UI shows the real amount without a redeploy.
async function stripePriceAmount(priceId: string): Promise<{ amount: number; currency: string } | null> {
 const key = process.env.STRIPE_SECRET_KEY?.trim();
 if (!key) return null;
 try {
 const res = await fetch(`https://api.stripe.com/v1/prices/${priceId}`, {
  headers: { Authorization: `Bearer ${key}` },
  signal: AbortSignal.timeout(8000),
 });
 if (!res.ok) return null;
 const p = await res.json();
 if (typeof p.unit_amount !== "number") return null;
 return { amount: p.unit_amount, currency: p.currency || "usd" };
 } catch {
 return null;
 }
}

// GET /api/store/billing — current plan + the tier catalog with live prices.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const plan = await getStorePlan(slug);

 const tiers = await Promise.all(
 TIERS.map(async (t) => {
  const price: Record<Interval, { amount: number; currency: string } | null> = { month: null, year: null };
  for (const interval of ["month", "year"] as Interval[]) {
   const pid = priceIdFor(t.id, interval);
   price[interval] = pid ? await stripePriceAmount(pid) : null;
  }
  return {
   id: t.id,
   name: t.name,
   tagline: t.tagline,
   order: t.order,
   priced: !!(priceIdFor(t.id, "month") || priceIdFor(t.id, "year")),
   price, // { month:{amount,currency}|null, year:{...}|null } — amount in cents
   features: featuresForTier(t.id).map((f) => FEATURE_LABELS[f]),
   // The subset of `features` this tier introduces, so the cards can mark what upgrading buys.
   // Sent alongside rather than reshaping `features` into objects — that field is public API.
   newFeatures: addedFeaturesForTier(t.id).map((f) => FEATURE_LABELS[f]),
  };
 }),
 );

 // Whether she has already asked to cancel. This lives on the Stripe subscription, not in our
 // table, because it is a fact about the schedule rather than about entitlement — she keeps the
 // tier until the period ends either way. Best-effort: a Stripe hiccup must not blank the screen,
 // it just means the "cancels on…" line is absent for one load.
 let cancelAtPeriodEnd = false;
 if (plan.stripeSubscriptionId && stripeConfigured()) {
 const sub = await stripeGet(`subscriptions/${plan.stripeSubscriptionId}`).catch(() => null);
 cancelAtPeriodEnd = Boolean(sub?.cancel_at_period_end);
 }

 return NextResponse.json({
 configured: plansConfigured(),
 trialDays: TRIAL_DAYS,
 annualDiscountPct: ANNUAL_DISCOUNT_PCT,
 // The phone mounts Stripe's native payment sheet, which needs this before any card is entered.
 publishableKey: (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY)?.trim() || null,
 current: {
  tier: plan.tier,
  interval: plan.interval,
  status: plan.status,
  plan: plan.plan,
  currentPeriodEnd: plan.currentPeriodEnd,
  cancelAtPeriodEnd,
 },
 tiers,
 });
}
