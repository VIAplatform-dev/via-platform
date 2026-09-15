import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getShippingSettings } from "@/app/lib/store-shipping-db";
import { servedZones } from "@/app/lib/shipping-zones";
import { getTaxSettings, setTaxSettings, stripeTaxReady } from "@/app/lib/store-tax-db";
import { getSellerPayments } from "@/app/lib/seller-payments-db";

export const dynamic = "force-dynamic";

// The acting store's sales-tax setting. VYA never calculates tax: storefront
// sales are direct charges on the seller's own Stripe account, so collection and
// filing are theirs. Turning this on tells Stripe Tax to calculate at checkout
// against THEIR registrations.

export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const [settings, pay] = await Promise.all([
  getTaxSettings(slug),
  getSellerPayments(slug).catch(() => null),
 ]);
 const ready = pay?.stripeAccountId ? await stripeTaxReady(pay.stripeAccountId) : { active: false, registrations: 0 };
 // Where the store is established, which is what decides WHICH threshold applies to it. From the
 // ship-from, because that is the address a seller fills in early and the one carriers rate on.
 const homeCountry = (await getShippingSettings(slug).catch(() => null))?.shipFrom?.country ?? null;
 // Whether she posts abroad at all: the international note is noise for a store that doesn't.
 const shipsAbroad = servedZones((await getShippingSettings(slug).catch(() => null))?.zones).some((z) => z !== "domestic");
 return NextResponse.json({
  homeCountry,
  shipsAbroad,
  ok: true,
  ...settings,
  // Tax needs somewhere to be calculated against, no connected account, nothing to do.
  payoutsReady: Boolean(pay?.stripeAccountId && pay?.chargesEnabled),
  // Stripe's own view: is Tax set up, and in how many places is this store registered?
  stripeTaxActive: ready.active,
  registrations: ready.registrations,
 });
}

export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => ({}));
 if (body?.enabled === true) {
  // Refuse to switch on what can't work: Stripe Tax calculates on the connected
  // account, so without one the buyer would be charged nothing and the store
  // would believe it was collecting.
  const pay = await getSellerPayments(slug).catch(() => null);
  if (!pay?.stripeAccountId || !pay.chargesEnabled) {
   return NextResponse.json({ error: "Finish setting up payments first. Tax is calculated on your own Stripe account." }, { status: 400 });
  }
 }

 const next = await setTaxSettings(slug, {
  enabled: typeof body?.enabled === "boolean" ? body.enabled : undefined,
  productTaxCode: typeof body?.productTaxCode === "string" && body.productTaxCode.trim() ? body.productTaxCode.trim() : undefined,
 });
 return NextResponse.json({ ok: true, ...next });
}
