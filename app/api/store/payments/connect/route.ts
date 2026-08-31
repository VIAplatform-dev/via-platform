import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { stores, storeContactEmails } from "@/app/lib/stores";
import { getSellerPayments, saveStripeAccount } from "@/app/lib/seller-payments-db";
import { connectBlockedReason } from "@/app/lib/stripe-mode";
import { stripePost, stripeConfigured } from "@/app/lib/stripe";
import { syncPayoutSchedule } from "@/app/lib/payout-schedule";

export const dynamic = "force-dynamic";

function baseUrl(request: NextRequest) {
 const host = request.headers.get("host") || "vyaplatform.com";
 const proto = host.startsWith("localhost") ? "http" : "https";
 return `${proto}://${host}`;
}

// POST — start (or resume) Stripe Connect Express onboarding. Creates the
// connected account on first call, then returns a one-time onboarding URL.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!stripeConfigured()) {
 return NextResponse.json({ error: "Payments aren’t enabled on the server yet." }, { status: 503 });
 }

 const store = stores.find((s) => s.slug === slug);
 const sp = await getSellerPayments(slug);
 let accountId = sp?.stripeAccountId || null;

 // Refuse rather than overwrite. The row holds ONE account id, so connecting a store that is
 // already live-connected while the server runs test keys would replace its real account with a
 // sandbox one and take its checkout down. This is the check that makes a mis-pointed sandbox
 // annoying instead of destructive — see stripe-mode.ts.
 const blocked = connectBlockedReason(sp);
 if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

 try {
 // Create the Express account on first connect.
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

 // Payouts wait out this store's own return window, so a refund is always drawn from money still
 // sitting in their Stripe balance rather than from their bank account (see payout-schedule.ts).
 // Deliberately a SEPARATE call, and deliberately swallowed: whether a platform may set a
 // connected account's payout schedule depends on how that account is configured, and a Stripe
 // that refuses the schedule must not be able to stop a seller from onboarding at all. Runs on
 // every connect, so an account created before this existed — or one whose policy has since moved
 // — is reconciled the next time the seller opens payments.
 await syncPayoutSchedule(slug).catch(() => null);

 // One-time Stripe-hosted onboarding link.
 const base = baseUrl(request);
 const link = await stripePost("account_links", {
 account: accountId,
 refresh_url: `${base}/admin/payments?refresh=1`,
 return_url: `${base}/admin/payments?done=1`,
 type: "account_onboarding",
 });

 return NextResponse.json({ ok: true, url: link.url });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe error" }, { status: 502 });
 }
}
