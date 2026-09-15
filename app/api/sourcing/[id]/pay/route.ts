import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { getSourcingRequestById, updateSourcingStripeSession } from "@/app/lib/sourcing-db";

const SOURCING_FEE_CENTS = 2000;

function getBaseUrl(request: NextRequest) {
 const host = request.headers.get("host") || "vyaplatform.com";
 const proto = host.startsWith("localhost") ? "http" : "https";
 return `${proto}://${host}`;
}

async function stripeGet(path: string) {
 const key = process.env.STRIPE_SECRET_KEY?.trim();
 if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
 const res = await fetch(`https://api.stripe.com/v1/${path}`, {
 headers: { Authorization: `Bearer ${key}` },
 });
 const json = await res.json();
 if (!res.ok) throw new Error(json.error?.message || `Stripe error: ${res.status}`);
 return json;
}

async function stripePost(path: string, params: Record<string, string>) {
 const key = process.env.STRIPE_SECRET_KEY?.trim();
 if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
 const res = await fetch(`https://api.stripe.com/v1/${path}`, {
 method: "POST",
 headers: {
 Authorization: `Bearer ${key}`,
 "Content-Type": "application/x-www-form-urlencoded",
 },
 body: new URLSearchParams(params).toString(),
 });
 const json = await res.json();
 if (!res.ok) throw new Error(json.error?.message || `Stripe error: ${res.status}`);
 return json;
}

export async function POST(
 request: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const session = await auth();
 if (!session?.user?.id || !session.user.email) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 try {
 const { id } = await params;
 const req = await getSourcingRequestById(id, session.user.id);
 if (!req) {
 return NextResponse.json({ error: "Request not found" }, { status: 404 });
 }

 // Already paid: block duplicate payment
 if (req.status !== "pending_payment") {
 return NextResponse.json({ error: "This request has already been paid." }, { status: 400 });
 }

 // Try to reuse existing Stripe session
 if (req.stripeSessionId) {
 try {
 const existing = await stripeGet(`checkout/sessions/${req.stripeSessionId}`);
 if (existing.status === "open" && existing.client_secret) {
 return NextResponse.json({
 clientSecret: existing.client_secret,
 });
 }
 } catch {
 // Session expired or invalid. Fall through to create a new one
 }
 }

 // Create a fresh session (old one expired)
 const checkoutSession = await stripePost("checkout/sessions", {
 mode: "payment",
 "line_items[0][price_data][currency]": "usd",
 "line_items[0][price_data][product_data][name]": "VYA Sourcing Request",
 "line_items[0][price_data][product_data][description]": "Refundable if no match is found within 21 business days.",
 "line_items[0][price_data][unit_amount]": String(SOURCING_FEE_CENTS),
 "line_items[0][quantity]": "1",
 ui_mode: "embedded",
 customer_email: session.user.email,
 return_url: `${getBaseUrl(request)}/account/sourcing?success=true&session_id={CHECKOUT_SESSION_ID}`,
 "metadata[type]": "sourcing_request",
 "metadata[request_id]": req.id,
 });

 // Update the session ID so the webhook can mark it paid
 await updateSourcingStripeSession(id, session.user.id, checkoutSession.id);

 return NextResponse.json({ clientSecret: checkoutSession.client_secret });
 } catch (err) {
 const message = err instanceof Error ? err.message : String(err);
 console.error("Sourcing pay error:", message);
 return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
 }
}
