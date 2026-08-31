import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerPayments, updateSellerStatus } from "@/app/lib/seller-payments-db";
import { stripeGet, stripeConfigured } from "@/app/lib/stripe";
import { getRefundPolicy } from "@/app/lib/store-policy-db";
import { payoutScheduleFor, payoutScheduleNotice } from "@/app/lib/payout-schedule";

export const dynamic = "force-dynamic";

// GET — the acting store's payment-acceptance status, refreshed live from Stripe
// so onboarding progress shows immediately.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const sp = await getSellerPayments(slug);
 let chargesEnabled = sp?.chargesEnabled ?? false;
 let payoutsEnabled = sp?.payoutsEnabled ?? false;
 let detailsSubmitted = sp?.detailsSubmitted ?? false;

 if (sp?.stripeAccountId && stripeConfigured()) {
 try {
 const acct = await stripeGet(`accounts/${sp.stripeAccountId}`);
 chargesEnabled = Boolean(acct.charges_enabled);
 payoutsEnabled = Boolean(acct.payouts_enabled);
 detailsSubmitted = Boolean(acct.details_submitted);
 await updateSellerStatus(slug, { chargesEnabled, payoutsEnabled, detailsSubmitted });
 } catch {
 /* keep cached values on a transient Stripe error */
 }
 }

 // How long payouts wait, and why — derived from the store's OWN returns policy so the seller can
 // see the connection between the two (see payout-schedule.ts).
 const schedule = payoutScheduleFor(await getRefundPolicy(slug).catch(() => null));
 return NextResponse.json({
 ok: true,
 configured: stripeConfigured(),
 connected: Boolean(sp?.stripeAccountId),
 chargesEnabled,
 payoutsEnabled,
 detailsSubmitted,
 payoutDelayDays: schedule.delayDays,
 returnWindowDays: schedule.windowDays,
 payoutNotice: payoutScheduleNotice(schedule),
 });
}
