import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { stores, storeContactEmails } from "@/app/lib/stores";
import { getSellerPayments, saveStripeAccount } from "@/app/lib/seller-payments-db";
import { connectBlockedReason } from "@/app/lib/stripe-mode";
import { stripePost, stripeConfigured } from "@/app/lib/stripe";
import { syncPayoutSchedule } from "@/app/lib/payout-schedule";

export const dynamic = "force-dynamic";

// POST — mint an AccountSession for embedded Connect components. This is what lets the seller
// onboard AND manage payouts entirely inside getvya.ai (no redirect to a Stripe-hosted page, no
// Stripe dashboard) — the surfaces render as embedded components themed to VYA. Same Express /
// direct-charges / Stripe-liability model as before; only the UI surface changes. connect-js calls
// this to (re)fetch a client secret, so it's expected to be hit more than once.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!stripeConfigured()) return NextResponse.json({ error: "Payments aren’t enabled on the server yet." }, { status: 503 });

 const publishableKey = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY)?.trim();
 if (!publishableKey) return NextResponse.json({ error: "Stripe publishable key isn’t configured." }, { status: 503 });

 try {
 const store = stores.find((s) => s.slug === slug);
 const sp = await getSellerPayments(slug);
 let accountId = sp?.stripeAccountId || null;

 // Refuse rather than overwrite. The row holds ONE account id, so connecting a store that is
 // already live-connected while the server runs test keys would replace its real account with a
 // sandbox one and take its checkout down. This is the check that makes a mis-pointed sandbox
 // annoying instead of destructive — see stripe-mode.ts.
 const blocked = connectBlockedReason(sp);
 if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

 // Create the Express connected account on first use (same shape as the redirect flow).
 if (!accountId) {
 const acct = await stripePost("accounts", {
 type: "express",
 email: storeContactEmails[slug] || undefined,
 business_profile: { name: store?.name || slug },
 capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
 metadata: { store_slug: slug },
 });
 accountId = acct.id as string;
 await saveStripeAccount(slug, accountId);
 }

 // Payouts wait out the store's own return window, so a refund is always drawn from money still in
 // their Stripe balance (see payout-schedule.ts). This is the path sellers ACTUALLY onboard
 // through — the embedded components — so setting it only on the redirect route would have meant
 // almost no real account ever got the schedule. Best-effort: never block onboarding.
 await syncPayoutSchedule(slug).catch(() => null);

 // Enable the embedded surfaces: onboarding (KYC/bank), plus ongoing payouts + account
 // management so the seller never needs the Stripe-hosted Express dashboard.
 const session = await stripePost("account_sessions", {
 account: accountId,
 components: {
 account_onboarding: { enabled: true },
 payouts: { enabled: true },
 account_management: { enabled: true },
 notification_banner: { enabled: true },
 },
 });

 return NextResponse.json({ ok: true, clientSecret: session.client_secret, publishableKey });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe error" }, { status: 502 });
 }
}
