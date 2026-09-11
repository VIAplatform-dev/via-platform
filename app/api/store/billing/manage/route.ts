import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getStorePlan, setStorePlan } from "@/app/lib/store-plans-db";
import { TIERS, priceIdFor, priceEnvName, type TierId, type Interval } from "@/app/lib/plans";
import { stripePost, stripeGet, stripeConfigured } from "@/app/lib/stripe";

export const dynamic = "force-dynamic";

// Everything the Stripe billing portal did, as API calls the phone can make itself.
//
// The portal is a hosted web page. These four actions are the whole of what a VYA seller ever went
// there for, so they are here instead and the app never leaves itself:
//
//   card         — a SetupIntent + customer session for the native sheet, then set as the default.
//   cancel       — at the END of the period she has paid for, never immediately. She bought the month.
//   resume       — undo that, while the period is still running.
//   change-plan  — swap the price on the existing subscription, prorated.
//
// change-plan REPLACES THE ITEM rather than adding one. A subscription can hold several prices at
// once; appending would bill her for Studio AND Atelier every month, which is the kind of mistake
// that ends up as a refund and an apology.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!stripeConfigured()) return NextResponse.json({ error: "Billing isn’t configured yet." }, { status: 503 });

 const body = await request.json().catch(() => null);
 const action = String(body?.action ?? "");
 const plan = await getStorePlan(slug);

 try {
 if (action === "card") {
  if (!plan.stripeCustomerId) return NextResponse.json({ error: "No billing account yet — start a plan first." }, { status: 400 });
  const publishableKey = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY)?.trim();
  if (!publishableKey) return NextResponse.json({ error: "Stripe publishable key isn’t configured." }, { status: 503 });
  const customerSession = await stripePost("customer_sessions", {
  customer: plan.stripeCustomerId,
  components: { mobile_payment_element: { enabled: true, features: { payment_method_save: "enabled", payment_method_redisplay: "enabled", payment_method_remove: "enabled" } } },
  });
  const setupIntent = await stripePost("setup_intents", {
  customer: plan.stripeCustomerId,
  usage: "off_session",
  automatic_payment_methods: { enabled: true },
  metadata: { type: "store_billing_card", store_slug: slug },
  });
  return NextResponse.json({
  ok: true, publishableKey, customerId: plan.stripeCustomerId,
  customerSessionClientSecret: customerSession.client_secret,
  setupIntentClientSecret: setupIntent.client_secret,
  });
 }

 if (action === "card-saved") {
  // Called after the sheet succeeds: make what she just entered the card future invoices use.
  // Read back from the SetupIntent rather than trusting an id posted by the client.
  if (!plan.stripeCustomerId) return NextResponse.json({ error: "No billing account yet." }, { status: 400 });
  const id = String(body?.setupIntentId ?? "");
  if (!id) return NextResponse.json({ error: "Missing setup intent." }, { status: 400 });
  const si = await stripeGet(`setup_intents/${id}`);
  if ((si.customer as string) !== plan.stripeCustomerId) return NextResponse.json({ error: "Not this store's card." }, { status: 403 });
  const pm = si.payment_method as string | null;
  if (!pm) return NextResponse.json({ error: "That card didn't save. Try again." }, { status: 400 });
  await stripePost(`customers/${plan.stripeCustomerId}`, { invoice_settings: { default_payment_method: pm } });
  if (plan.stripeSubscriptionId) await stripePost(`subscriptions/${plan.stripeSubscriptionId}`, { default_payment_method: pm }).catch(() => null);
  return NextResponse.json({ ok: true });
 }

 if (!plan.stripeSubscriptionId) return NextResponse.json({ error: "No subscription to manage yet." }, { status: 400 });

 if (action === "cancel" || action === "resume") {
  const sub = await stripePost(`subscriptions/${plan.stripeSubscriptionId}`, {
  cancel_at_period_end: action === "cancel" ? "true" : "false",
  });
  return NextResponse.json({
  ok: true,
  cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  currentPeriodEnd: sub.current_period_end ? new Date(Number(sub.current_period_end) * 1000).toISOString() : null,
  });
 }

 if (action === "change-plan") {
  const tier = body?.tier as TierId;
  const interval: Interval = body?.interval === "year" ? "year" : "month";
  if (!TIERS.some((t) => t.id === tier)) return NextResponse.json({ error: "Unknown plan tier" }, { status: 400 });
  const priceId = priceIdFor(tier, interval);
  if (!priceId) return NextResponse.json({ error: `That plan isn’t priced yet. Set ${priceEnvName(tier, interval)} in Stripe.` }, { status: 503 });

  // The id of the item we are replacing — without it Stripe ADDS a price and bills for both.
  const current = await stripeGet(`subscriptions/${plan.stripeSubscriptionId}`);
  const itemId = (current as { items?: { data?: { id?: string }[] } }).items?.data?.[0]?.id;
  if (!itemId) return NextResponse.json({ error: "Couldn't read your current plan." }, { status: 502 });

  const sub = await stripePost(`subscriptions/${plan.stripeSubscriptionId}`, {
  items: { 0: { id: itemId, price: priceId } },
  proration_behavior: "create_prorations",
  cancel_at_period_end: "false",
  metadata: { type: "store_subscription", store_slug: slug, tier, interval },
  });
  await setStorePlan(slug, { tier, interval, status: sub.status as string });
  return NextResponse.json({ ok: true, tier, interval, status: sub.status });
 }

 return NextResponse.json({ error: "Unknown action" }, { status: 400 });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe error" }, { status: 502 });
 }
}
