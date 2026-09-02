import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { stripeConfigured } from "@/app/lib/stripe";
import { bankMandateUrl, debitMandateSummary } from "@/app/lib/store-debit";
import { clearDebitMandate } from "@/app/lib/seller-payments-db";
import { storeContactEmails, stores } from "@/app/lib/stores";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The store's authorisation for VYA to debit its bank, which is what funds a consignor payout for a
// sale that settled on eBay or Depop. See app/lib/store-debit.ts for why it works this way.

export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 return NextResponse.json(await debitMandateSummary(slug));
}

// Returns a Stripe-hosted URL where the store connects its bank. Nothing is saved until the store
// finishes there and Stripe tells us so — see the store_bank_mandate case in the Stripe webhook.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 if (!stripeConfigured()) return NextResponse.json({ error: "Payments aren’t enabled on the server yet." }, { status: 503 });
 const name = (stores as Array<{ slug: string; name?: string }>).find((s) => s.slug === slug)?.name ?? null;
 try {
  const url = await bankMandateUrl(slug, { email: storeContactEmails[slug] ?? null, name });
  return NextResponse.json({ url });
 } catch (e) {
  return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn’t open the bank connection." }, { status: 502 });
 }
}

// Revoke. Debits already clearing are unaffected — they are authorised by the mandate that was live
// when they started, and cancelling one is a separate act with its own consequences for a balance.
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 await clearDebitMandate(slug);
 return NextResponse.json({ ok: true });
}
