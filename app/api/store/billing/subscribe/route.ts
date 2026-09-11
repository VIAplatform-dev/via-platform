import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { auth } from "@/app/lib/auth";
import { storeContactEmails, stores } from "@/app/lib/stores";
import { getStorePlan, setStorePlan } from "@/app/lib/store-plans-db";
import { TIERS, TRIAL_DAYS, priceIdFor, priceEnvName, type TierId, type Interval } from "@/app/lib/plans";
import { stripePost, stripeConfigured } from "@/app/lib/stripe";

export const dynamic = "force-dynamic";

// Start a subscription from the PHONE, with the card entered in Stripe's native sheet.
//
// The web starts one through Stripe Checkout, which is a hosted web page — fine in a browser, wrong
// in an app. This route returns the pieces the mobile PaymentSheet needs instead, so the seller
// types her card into a native sheet over VYA and never sees a web page.
//
// THE SUBSCRIPTION IS CREATED HERE, INCOMPLETE, BEFORE ANY CARD EXISTS. That is the documented
// pattern (`payment_behavior: default_incomplete`) and it matters for one reason: the metadata that
// tells our webhook which store and tier this is lives on the subscription itself. Create it after
// the card and there is a window where Stripe knows about a payment we cannot attribute.
//
// TRIAL VS NO TRIAL CHANGES WHICH SECRET COMES BACK. With a free trial the first invoice is zero, so
// there is nothing to charge and Stripe hands back a SetupIntent — we are saving a card for later,
// not taking money now. Without a trial there is a real invoice and a PaymentIntent. The phone has
// to be told which one it is holding, because PaymentSheet refuses both at once.
export async function POST(request: NextRequest) {
 // Same two doors as billing/checkout: a web session, or the app's bearer token.
 const session = await auth();
 let slug: string | null = null;
 let email: string | null = session?.user?.email ?? null;
 if (email) {
 slug = Object.entries(storeContactEmails).find(([, e]) => e.toLowerCase() === email!.toLowerCase())?.[0] ?? null;
 }
 if (!slug) {
 slug = await resolveStoreSlugAny(request);
 email = slug ? storeContactEmails[slug] ?? null : null;
 }
 if (!slug) return NextResponse.json({ error: "Not a registered store partner" }, { status: 403 });
 if (!stripeConfigured()) return NextResponse.json({ error: "Billing isn’t configured yet." }, { status: 503 });

 const publishableKey = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY)?.trim();
 if (!publishableKey) return NextResponse.json({ error: "Stripe publishable key isn’t configured." }, { status: 503 });

 const body = (await request.json().catch(() => ({}))) as { tier?: string; interval?: string };
 const tier = body.tier as TierId;
 const interval: Interval = body.interval === "year" ? "year" : "month";
 if (!TIERS.some((t) => t.id === tier)) return NextResponse.json({ error: "Unknown plan tier" }, { status: 400 });

 const priceId = priceIdFor(tier, interval);
 if (!priceId) return NextResponse.json({ error: `That plan isn’t priced yet. Set ${priceEnvName(tier, interval)} in Stripe.` }, { status: 503 });

 const plan = await getStorePlan(slug);
 // Refuse rather than stack a second subscription on the same store — changing plan is its own
 // action (billing/manage), and two live subscriptions means two charges a month.
 if (plan.stripeSubscriptionId && plan.status && !["canceled", "incomplete_expired"].includes(plan.status)) {
 return NextResponse.json({ error: "This store already has a plan. Change it instead of starting a second one." }, { status: 409 });
 }

 try {
 // One customer per store, reused for domains and shipping labels too.
 let customerId = plan.stripeCustomerId;
 if (!customerId) {
  const store = stores.find((s) => s.slug === slug);
  const customer = await stripePost("customers", {
  ...(email ? { email } : {}),
  name: store?.name || slug,
  metadata: { store_slug: slug },
  });
  customerId = customer.id as string;
  await setStorePlan(slug, { stripeCustomerId: customerId });
 }

 // Lets the sheet show and manage cards already saved against this customer.
 const customerSession = await stripePost("customer_sessions", {
 customer: customerId,
 components: {
  mobile_payment_element: {
  enabled: true,
  features: { payment_method_save: "enabled", payment_method_redisplay: "enabled", payment_method_remove: "enabled" },
  },
 },
 });

 const subscription = await stripePost("subscriptions", {
 customer: customerId,
 items: { 0: { price: priceId } },
 payment_behavior: "default_incomplete",
 ...(TRIAL_DAYS > 0 ? { trial_period_days: String(TRIAL_DAYS) } : {}),
 // Keep the card on file when the trial ends, or the subscription cancels itself on day 31.
 ...(TRIAL_DAYS > 0 ? { trial_settings: { end_behavior: { missing_payment_method: "cancel" } } } : {}),
 payment_settings: { save_default_payment_method: "on_subscription" },
 // The webhook reads exactly these (app/api/webhooks/stripe/route.ts) — same shape Checkout writes,
 // so a subscription started on the phone syncs through the identical path as one started on the web.
 metadata: { type: "store_subscription", store_slug: slug, tier, interval },
 expand: { 0: "latest_invoice.payment_intent", 1: "pending_setup_intent" },
 // A double-tap must not create two subscriptions for one store. The PREVIOUS subscription id is
 // in the key on purpose: a key of slug+tier+interval alone never changes, so a seller who
 // cancelled and came back to the same tier inside Stripe's 24h idempotency window would be handed
 // her old CANCELLED subscription back instead of a new one. Including what she is replacing makes
 // a genuine second attempt distinct while a double-tap stays identical.
 }, undefined, `sub-${slug}-${tier}-${interval}-${plan.stripeSubscriptionId ?? "first"}`);

 const setupSecret = (subscription.pending_setup_intent as { client_secret?: string } | null)?.client_secret ?? null;
 const paymentSecret = ((subscription.latest_invoice as { payment_intent?: { client_secret?: string } } | null)?.payment_intent)?.client_secret ?? null;
 if (!setupSecret && !paymentSecret) {
 return NextResponse.json({ error: "Stripe didn’t return anything to confirm. Try again." }, { status: 502 });
 }

 // Record what we know now; the webhook confirms it when the card clears.
 await setStorePlan(slug, { tier, interval, status: subscription.status as string, stripeSubscriptionId: subscription.id as string, stripeCustomerId: customerId });

 return NextResponse.json({
 ok: true,
 publishableKey,
 customerId,
 customerSessionClientSecret: customerSession.client_secret,
 setupIntentClientSecret: setupSecret,
 paymentIntentClientSecret: setupSecret ? null : paymentSecret,
 trialDays: TRIAL_DAYS,
 });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe error" }, { status: 502 });
 }
}
