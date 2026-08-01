import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getStorePlan } from "@/app/lib/store-plans-db";
import {
 TIERS, TRIAL_DAYS, ANNUAL_DISCOUNT_PCT, plansConfigured,
 priceIdFor, featuresForTier, FEATURE_LABELS, type Interval,
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
  };
 }),
 );

 return NextResponse.json({
 configured: plansConfigured(),
 trialDays: TRIAL_DAYS,
 annualDiscountPct: ANNUAL_DISCOUNT_PCT,
 current: {
  tier: plan.tier,
  interval: plan.interval,
  status: plan.status,
  plan: plan.plan,
  currentPeriodEnd: plan.currentPeriodEnd,
 },
 tiers,
 });
}
