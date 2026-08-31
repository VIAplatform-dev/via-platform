import { NextResponse } from "next/server";
import { getDomainInfo, getDomainPrice, setAutoRenew } from "@/app/lib/vercel-domains";
import { storesWithDomains, claimRenewal, settleRenewal } from "@/app/lib/domain-billing-db";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { stripePost } from "@/app/lib/stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Charge sellers for the domains VYA registered on their behalf, ahead of renewal.
//
// The domain lives on VYA's Vercel account with auto-renew on, so Vercel bills VYA
// every year whether or not anyone bills the seller. Without this the cost is
// silent and compounds with every domain sold.
//
// Runs daily and does nothing to a domain until it is inside the window below.
// Every attempt is claimed in domain_renewals first (unique on domain + period),
// so overlapping runs, retries and redeploys cannot double-charge.
//
// Auth: CRON_SECRET, same as the other crons.

/** Charge this far ahead of expiry — enough runway to chase a failed card. */
const LEAD_DAYS = 30;

export async function GET(request: Request) {
 if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
 if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const stores = await storesWithDomains().catch(() => []);
 const results: { domain: string; store: string; outcome: string }[] = [];

 for (const { storeSlug, domain } of stores) {
  const info = await getDomainInfo(domain).catch(() => null);
  // Only domains WE registered cost VYA anything. A domain the seller connected
  // from their own registrar is billed by that registrar, to them.
  if (!info?.boughtThroughUs) continue;
  if (!info.autoRenew || !info.expiresAt) continue;

  const daysOut = Math.ceil((Date.parse(info.expiresAt) - Date.now()) / 86_400_000);
  if (daysOut > LEAD_DAYS || daysOut < 0) continue;

  const periodEnd = info.expiresAt.slice(0, 10);
  // Claim first: a crash after this point leaves a visible stuck row, which is
  // recoverable. A crash after charging without a claim would double-bill.
  if (!(await claimRenewal(domain, storeSlug, periodEnd))) continue;

  const price = await getDomainPrice(domain).catch(() => null);
  if (!price) {
   await settleRenewal(domain, periodEnd, { status: "skipped", detail: "No renewal price available from the registrar." });
   results.push({ domain, store: storeSlug, outcome: "no-price" });
   continue;
  }

  const seller = await getSellerBySlug(storeSlug).catch(() => null);
  if (!seller?.stripeCustomerId) {
   await settleRenewal(domain, periodEnd, { status: "failed", amountCents: price.priceCents, detail: "No payment method on file." });
   results.push({ domain, store: storeSlug, outcome: "no-card" });
   continue;
  }

  try {
   const charge = (await stripePost(
    "payment_intents",
    {
     amount: String(price.priceCents),
     currency: "usd",
     customer: seller.stripeCustomerId,
     confirm: "true",
     off_session: "true",
     description: `VYA domain renewal — ${domain}`,
    },
    undefined,
    // Stripe-side idempotency as well as our own, keyed to the same period.
    `domain-renew-${domain}-${periodEnd}`,
   )) as { id?: string };
   await settleRenewal(domain, periodEnd, { status: "charged", amountCents: price.priceCents, paymentIntent: charge?.id ?? null });
   results.push({ domain, store: storeSlug, outcome: "charged" });
  } catch (e) {
   // Card declined. Turn auto-renew OFF so Vercel doesn't bill VYA for a domain
   // nobody has paid for — the seller can re-enable it by fixing their card,
   // and the domain stays live until it actually expires.
   await setAutoRenew(domain, false).catch(() => {});
   await settleRenewal(domain, periodEnd, {
    status: "failed",
    amountCents: price.priceCents,
    detail: `Card declined — auto-renew paused. ${e instanceof Error ? e.message : ""}`.trim(),
   });
   results.push({ domain, store: storeSlug, outcome: "declined" });
  }
 }

 return NextResponse.json({ ok: true, checked: stores.length, acted: results.length, results });
}
