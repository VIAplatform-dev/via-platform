import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getShippingSettings } from "@/app/lib/store-shipping-db";
import { getRefundPolicy } from "@/app/lib/store-policy-db";
import { getStoreProfile } from "@/app/lib/store-profile-db";
import { storeCurrency } from "@/app/lib/store-currency-db";
import { formatPriceCents } from "@/app/lib/formatPrice";
import { writePolicies, canWrite, type PolicyKey } from "@/app/lib/policy-writer";
import { pickupOffered } from "@/app/lib/pickup-core";

export const dynamic = "force-dynamic";

/**
 * GET /api/store/policies/draft: her four policies, written out of her own settings.
 *
 * A DRAFT AND NOTHING ELSE. This writes nothing and saves nothing. The page puts the text in the
 * editor, she reads it, changes it, and saves it the normal way. Whatever she has already written
 * is untouched until she chooses to replace it.
 *
 * Every sentence comes from a setting she has already filled in, which is the whole point: a
 * generated shipping policy promising worldwide postage while Europe is switched off is worse than
 * an empty box, because it is a promise the checkout will refuse. See policy-writer.ts.
 */
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const [shipping, refunds, profile, currency] = await Promise.all([
  getShippingSettings(slug).catch(() => null),
  getRefundPolicy(slug).catch(() => null),
  getStoreProfile(slug).catch(() => null),
  storeCurrency(slug).catch(() => "USD"),
 ]);

 const inputs = {
  storeName: profile?.displayName || slug,
  legalName: profile?.legalName ?? null,
  supportEmail: profile?.supportEmail ?? null,
  shipFromCountry: shipping?.shipFrom?.country ?? null,
  zones: shipping?.zones ?? null,
  shipMode: shipping?.mode ?? null,
  freeThresholdCents: shipping?.freeThresholdCents ?? null,
  // Her currency, so a threshold reads "£150" in a London shop and never "$150".
  formatMoney: (cents: number) => formatPriceCents(cents, currency),
  pickup: pickupOffered(shipping?.pickup ?? null),
  pickupCity: shipping?.pickup?.address?.city ?? null,
  expedited: shipping?.expeditedOffered === true,
  dispatchDays: shipping?.dispatchDays ?? null,
  dutyMode: shipping?.dutyMode ?? null,
  refundsEnabled: refunds?.refundsEnabled,
  returnWindowDays: refunds?.returnWindowDays,
  restockingFeePct: refunds?.restockingFeePct,
  returnShippingPaidBy: refunds?.returnShippingPaidBy ?? null,
 };

 const drafts = writePolicies(inputs);
 // Which ones we can honestly write yet. A shop that has never opened Shipping gets no shipping
 // draft: it would be invented rather than read back.
 const available = (Object.keys(drafts) as PolicyKey[]).filter((k) => canWrite(k, inputs));

 return NextResponse.json({ ok: true, drafts, available });
}
