import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { stores, storeContactEmails } from "@/app/lib/stores";
import { getSellerPayments, saveStripeAccount } from "@/app/lib/seller-payments-db";
import { stripePost, stripeConfigured } from "@/app/lib/stripe";

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
