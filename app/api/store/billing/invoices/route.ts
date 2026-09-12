import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getStorePlan } from "@/app/lib/store-plans-db";
import { stripeGet, stripeConfigured } from "@/app/lib/stripe";

export const dynamic = "force-dynamic";

// What VYA has charged this store, so the phone can answer it without the Stripe billing portal.
//
// Reduced to the four things a seller actually asks of an invoice list — when, how much, did it go
// through, and where's the PDF. The portal answers those too, but only in a browser, and "open the
// website" was the thing this whole pass exists to delete.
//
// The PDF stays a link rather than something we proxy: it is a Stripe-signed URL, it expires, and
// re-serving it through VYA would mean holding a seller's billing documents on our side for no gain.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!stripeConfigured()) return NextResponse.json({ ok: true, invoices: [] });

 const plan = await getStorePlan(slug);
 // No customer means nothing has ever been billed. An empty list, not an error — a store on the
 // free plan asking for its invoices has asked a reasonable question with a boring answer.
 if (!plan.stripeCustomerId) return NextResponse.json({ ok: true, invoices: [] });

 try {
 const res = await stripeGet("invoices", { customer: plan.stripeCustomerId, limit: 24 });
 const invoices = (res.data as Record<string, unknown>[]).map((i) => ({
  id: String(i.id),
  number: (i.number as string) ?? null,
  amountCents: Number(i.amount_paid ?? i.amount_due ?? 0),
  currency: String(i.currency ?? "usd").toUpperCase(),
  status: String(i.status ?? "draft"),
  // Stripe timestamps are seconds; the phone wants something Date can read.
  createdAt: i.created ? new Date(Number(i.created) * 1000).toISOString() : null,
  pdfUrl: (i.invoice_pdf as string) ?? null,
 }));
 return NextResponse.json({ ok: true, invoices });
 } catch (e) {
 return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe error" }, { status: 502 });
 }
}
