import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { getSourcingRequestById } from "@/app/lib/sourcing-db";
import { neon } from "@neondatabase/serverless";

const CANCEL_WINDOW_DAYS = 21;

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
 _request: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const session = await auth();
 if (!session?.user?.id) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const { id } = await params;
 const req = await getSourcingRequestById(id, session.user.id);
 if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });

 // Draft (unpaid), just delete, no refund needed
 if (req.status === "pending_payment") {
 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
 await sql`DELETE FROM sourcing_requests WHERE id = ${id} AND user_id = ${session.user.id} AND status = 'pending_payment'`;
 return NextResponse.json({ ok: true, deleted: true });
 }

 if (req.status !== "paid") {
 return NextResponse.json({ error: "Only active requests can be cancelled." }, { status: 400 });
 }

 const daysSinceCreated =
 (Date.now() - new Date(req.createdAt).getTime()) / (1000 * 60 * 60 * 24);
 if (daysSinceCreated > CANCEL_WINDOW_DAYS) {
 return NextResponse.json(
 { error: `The ${CANCEL_WINDOW_DAYS}-day cancellation window has expired.` },
 { status: 400 }
 );
 }

 // Issue Stripe refund
 if (req.stripeSessionId) {
 try {
 const checkoutSession = await stripeGet(`checkout/sessions/${req.stripeSessionId}`);
 const paymentIntentId = checkoutSession.payment_intent;
 if (paymentIntentId) {
 await stripePost("refunds", { payment_intent: String(paymentIntentId) });
 }
 } catch (err) {
 console.error("[cancel-sourcing] Stripe refund failed:", err);
 return NextResponse.json(
 { error: "Refund failed. Please contact support." },
 { status: 500 }
 );
 }
 }

 // Mark request as refunded
 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
 await sql`
 UPDATE sourcing_requests
 SET status = 'refunded'
 WHERE id = ${id} AND user_id = ${session.user.id} AND status = 'paid'
 `;

 return NextResponse.json({ ok: true });
}
