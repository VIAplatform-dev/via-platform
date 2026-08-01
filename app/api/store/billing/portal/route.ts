import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getStorePlan } from "@/app/lib/store-plans-db";

export const dynamic = "force-dynamic";

function getBaseUrl(request: NextRequest) {
 const host = request.headers.get("host") || "getvya.ai";
 const proto = host.startsWith("localhost") ? "http" : "https";
 return `${proto}://${host}`;
}

// POST /api/store/billing/portal — open the Stripe billing portal to manage/cancel/
// switch plan. Requires an existing subscription (stripe_customer_id on the store).
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const key = process.env.STRIPE_SECRET_KEY?.trim();
 if (!key) return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 503 });

 const plan = await getStorePlan(slug);
 if (!plan.stripeCustomerId) {
 return NextResponse.json({ error: "No subscription to manage yet." }, { status: 400 });
 }

 try {
 const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
   customer: plan.stripeCustomerId,
   return_url: `${getBaseUrl(request)}/admin/billing`,
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
