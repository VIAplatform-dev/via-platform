import { NextResponse } from "next/server";
import { getConsignorEmail } from "@/app/lib/consignor-auth";
import { getConsignor, updateConsignor } from "@/app/lib/consignment-db";
import { stripePost, stripeConfigured } from "@/app/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function baseUrl(request: Request) {
 const host = request.headers.get("host") || "vyaplatform.com";
 const proto = host.startsWith("localhost") ? "http" : "https";
 return `${proto}://${host}`;
}

// The signed-in consignor connects their bank for direct deposit. Stripe Express onboarding.
// Creates their connected account on first call, then returns a one-time onboarding URL.
export async function POST(request: Request) {
 const email = getConsignorEmail(request);
 if (!email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
 if (!stripeConfigured()) return NextResponse.json({ error: "Direct deposit isn't available yet." }, { status: 503 });

 const body = await request.json().catch(() => null);
 const consignorId = Number(body?.consignorId);
 const consignor = consignorId ? await getConsignor(consignorId) : null;
 if (!consignor || (consignor.email ?? "").toLowerCase() !== email.toLowerCase()) return NextResponse.json({ error: "Not found" }, { status: 404 });

 try {
 let accountId = consignor.stripeAccountId;
 if (!accountId) {
 const acct = await stripePost("accounts", {
 type: "express",
 email: consignor.email || undefined,
 business_type: "individual", // a person, not a business, no website required
 business_profile: { product_description: "Sells secondhand fashion on consignment", mcc: "5931" },
 capabilities: { transfers: { requested: true } }, // receive transfers only
 metadata: { consignor_id: String(consignor.id), store_slug: consignor.storeSlug },
 });
 accountId = acct.id as string;
 await updateConsignor(consignor.id, { stripeAccountId: accountId });
 }
 const base = baseUrl(request);
 const link = await stripePost("account_links", {
 account: accountId,
 refresh_url: `${base}/consignor?connect=refresh`,
 return_url: `${base}/consignor?connect=done`,
 type: "account_onboarding",
 });
 return NextResponse.json({ ok: true, url: link.url });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe error" }, { status: 502 });
 }
}
