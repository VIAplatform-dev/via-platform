import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { storeContactEmails } from "@/app/lib/stores";
import { storeSlugForEmail } from "@/app/lib/store-users-db";
import { TIERS, TRIAL_DAYS, priceIdFor, priceEnvName, type TierId, type Interval } from "@/app/lib/plans";

export const dynamic = "force-dynamic";

function getStoreSlugFromEmail(email: string): string | null {
 for (const [slug, storeEmail] of Object.entries(storeContactEmails)) {
 if (storeEmail && storeEmail.toLowerCase() === email.toLowerCase()) return slug;
 }
 return null;
}

function getBaseUrl(request: NextRequest) {
 const host = request.headers.get("host") || "getvya.ai";
 const proto = host.startsWith("localhost") ? "http" : "https";
 return `${proto}://${host}`;
}

async function stripePost(path: string, params: Record<string, string>) {
 const key = process.env.STRIPE_SECRET_KEY?.trim();
 if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
 const res = await fetch(`https://api.stripe.com/v1/${path}`, {
 method: "POST",
 headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
 body: new URLSearchParams(params).toString(),
 });
 const json = await res.json();
 if (!res.ok) throw new Error(json.error?.message || `Stripe error: ${res.status}`);
 return json;
}

// POST /api/store/billing/checkout — start a getvya.ai subscription (30-day trial).
// Body: { tier: "starter"|"studio"|"atelier", interval: "month"|"year" }
export async function POST(request: NextRequest) {
 const session = await auth();
 if (!session?.user?.email) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 // Curated marketplace stores resolve from the static map; self-onboarded stores from store_users.
 const storeSlug = getStoreSlugFromEmail(session.user.email) ?? (await storeSlugForEmail(session.user.email));
 if (!storeSlug) {
 return NextResponse.json({ error: "Not a registered store partner" }, { status: 403 });
 }

 const body = (await request.json().catch(() => ({}))) as { tier?: string; interval?: string };
 const tier = body.tier as TierId;
 const interval: Interval = body.interval === "year" ? "year" : "month";
 if (!TIERS.some((t) => t.id === tier)) {
 return NextResponse.json({ error: "Unknown plan tier" }, { status: 400 });
 }

 const priceId = priceIdFor(tier, interval);
 if (!priceId) {
 return NextResponse.json(
 { error: `That plan isn't priced yet. Set ${priceEnvName(tier, interval)} in Stripe.` },
 { status: 503 },
 );
 }

 try {
 const base = getBaseUrl(request);
 const checkout = await stripePost("checkout/sessions", {
 mode: "subscription",
 "line_items[0][price]": priceId,
 "line_items[0][quantity]": "1",
 customer_email: session.user.email,
 success_url: `${base}/admin/billing?sub=success`,
 cancel_url: `${base}/admin/billing?sub=cancelled`,
 allow_promotion_codes: "true",
 "subscription_data[trial_period_days]": String(TRIAL_DAYS),
 "metadata[type]": "store_subscription",
 "metadata[store_slug]": storeSlug,
 "metadata[tier]": tier,
 "metadata[interval]": interval,
 // Carry onto the subscription so later subscription.* events can resolve store + tier.
 "subscription_data[metadata][type]": "store_subscription",
 "subscription_data[metadata][store_slug]": storeSlug,
 "subscription_data[metadata][tier]": tier,
 "subscription_data[metadata][interval]": interval,
 });
 return NextResponse.json({ url: checkout.url });
 } catch (err) {
 const message = err instanceof Error ? err.message : String(err);
 console.error("[store/billing/checkout] error:", message);
 return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
 }
}
