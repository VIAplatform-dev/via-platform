import { NextResponse } from "next/server";
import { getConsignorEmail } from "@/app/lib/consignor-auth";
import { getConsignor, updateConsignor } from "@/app/lib/consignment-db";
import { stripePost, stripeConfigured } from "@/app/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST { consignorId } — mint an AccountSession so the consignor adds their bank + manages payouts
// via EMBEDDED components inside the VYA consignor portal (no redirect to Stripe). Same Express /
// transfers-only model as the redirect flow; only the surface changes. connect-js calls this to
// (re)fetch a client secret, so it's expected to be hit more than once.
export async function POST(request: Request) {
 const email = getConsignorEmail(request);
 if (!email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
 if (!stripeConfigured()) return NextResponse.json({ error: "Direct deposit isn’t available yet." }, { status: 503 });

 const publishableKey = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY)?.trim();
 if (!publishableKey) return NextResponse.json({ error: "Stripe publishable key isn’t configured." }, { status: 503 });

 const body = await request.json().catch(() => null);
 const consignorId = Number(body?.consignorId);
 const consignor = consignorId ? await getConsignor(consignorId) : null;
 if (!consignor || (consignor.email ?? "").toLowerCase() !== email.toLowerCase()) {
 return NextResponse.json({ error: "Not found" }, { status: 404 });
 }

 try {
 let accountId = consignor.stripeAccountId;
 // Create the Express (transfers-only) account on first use — same shape as the redirect flow.
 if (!accountId) {
 const acct = await stripePost("accounts", {
 type: "express",
 email: consignor.email || undefined,
 business_type: "individual",
 business_profile: { product_description: "Sells secondhand fashion on consignment", mcc: "5931" },
 capabilities: { transfers: { requested: true } },
 metadata: { consignor_id: String(consignor.id), store_slug: consignor.storeSlug },
 });
 accountId = acct.id as string;
 await updateConsignor(consignor.id, { stripeAccountId: accountId });
 }

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
