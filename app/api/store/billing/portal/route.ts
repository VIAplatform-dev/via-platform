import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { ensureBillingCustomer } from "@/app/lib/store-card";

export const dynamic = "force-dynamic";

function getBaseUrl(request: NextRequest) {
 const host = request.headers.get("host") || "getvya.ai";
 const proto = host.startsWith("localhost") ? "http" : "https";
 return `${proto}://${host}`;
}

/**
 * POST /api/store/billing/portal: open the Stripe billing portal.
 *
 * IT NO LONGER NEEDS A SUBSCRIPTION. It used to refuse with "No subscription to manage yet"
 * whenever the store had no stripe_customer_id, which made a card impossible to add for exactly
 * the stores that needed one: shipping's "You pay, free for the buyer" and "Free over an amount"
 * are gated on a card VYA can bill, and a store on the free trial had no customer, so the only
 * route to the card answered 400 and the settings link was a dead end.
 *
 * A customer is created on demand instead. It is free, it carries no subscription, and it is the
 * same record a later subscription attaches to, so nothing is duplicated when she does subscribe.
 *
 * `intent=card` returns the portal at its payment-methods page rather than the subscription
 * overview, because arriving from "Add a card" and landing on a plan summary is what made this
 * feel like the wrong place to begin with.
 */
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const key = process.env.STRIPE_SECRET_KEY?.trim();
 if (!key) return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 503 });

 const body = await request.json().catch(() => null);
 const wantsCard = body?.intent === "card";

 // The billing customer, not the Connect account: this is the record VYA CHARGES, and it is
 // separate from the account VYA pays her through. Created on demand so a store with no
 // subscription can still add a card (store-card.ts says why that matters).
 const customer = await ensureBillingCustomer(slug);
 if (!customer) return NextResponse.json({ error: "Could not open billing." }, { status: 502 });

 try {
 const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
   customer,
   return_url: `${getBaseUrl(request)}/admin/settings/plan`,
   // Straight to the cards. The generic portal opens on a subscription summary, which is not what
   // somebody who pressed "Add a card" came for.
   ...(wantsCard ? { "flow_data[type]": "payment_method_update" } : {}),
  }).toString(),
 });
 const json = await res.json();
 if (!res.ok) throw new Error(json.error?.message || `Stripe error: ${res.status}`);
 return NextResponse.json({ url: json.url });
 } catch (err) {
 console.error("[store/billing/portal] error:", err instanceof Error ? err.message : err);
 return NextResponse.json({ error: "Could not open billing portal." }, { status: 500 });
 }
}
