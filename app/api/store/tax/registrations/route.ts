import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { listTaxRegistrations, addTaxRegistration, endTaxRegistration, ensureTaxHeadOffice } from "@/app/lib/store-tax-db";
import { getShippingSettings } from "@/app/lib/store-shipping-db";
import { servedZones, ZONE_LABELS } from "@/app/lib/shipping-zones";
import { getSellerPayments } from "@/app/lib/seller-payments-db";
import { payableAccountId } from "@/app/lib/stripe-mode";

export const dynamic = "force-dynamic";

// Where a store is registered to collect tax, and where it is selling without being.
//
// The gap is the whole point. A store can happily open shipping to Europe and never register for
// VAT anywhere in it, and nothing in a normal checkout would ever mention that — Stripe simply
// calculates no tax, the sale goes through, and the liability accrues quietly against the seller.
// So this endpoint reports the registrations AND the zones she serves without one, which is the
// number she needs to see.
//
// VYA stores nothing here: Stripe Tax is the source of truth, because it is what actually decides
// whether tax is charged. A local copy would drift, and the drifting one is the one she'd trust.

/** Rough map from a shipping zone to the countries a seller would most likely need first. */
const ZONE_COUNTRIES: Record<string, string[]> = {
 europe: ["GB", "DE", "FR", "IE", "NL", "ES", "IT"],
 north_america: ["US", "CA"],
 rest_of_world: ["AU", "NZ", "JP", "SG"],
};

async function accountFor(slug: string): Promise<string | null> {
 const pay = await getSellerPayments(slug).catch(() => null);
 return payableAccountId(pay);
}

export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const acct = await accountFor(slug);
 if (!acct) return NextResponse.json({ ok: true, connected: false, registrations: [], gaps: [] });

 const [registrations, shipping] = await Promise.all([
  listTaxRegistrations(acct),
  getShippingSettings(slug).catch(() => null),
 ]);

 const registered = new Set(registrations.filter((r) => r.status !== "expired").map((r) => r.country));
 // A zone counts as covered once ANY country in it is registered — a fuller check would need to know
 // where her buyers actually are, and an over-precise warning gets ignored.
 const gaps = servedZones(shipping?.zones)
  .filter((z) => z !== "domestic")
  .filter((z) => !(ZONE_COUNTRIES[z] || []).some((c) => registered.has(c)))
  .map((z) => ({ zone: z, label: ZONE_LABELS[z], suggest: (ZONE_COUNTRIES[z] || []).slice(0, 3) }));

 // Whether she even CAN register yet — surfaced up front rather than as an error after she types.
 const hasAddress = Boolean(shipping?.shipFrom?.street1 && shipping?.shipFrom?.city && shipping?.shipFrom?.country);
 return NextResponse.json({ ok: true, connected: true, registrations, gaps, hasAddress });
}

/** POST { country, state? } — register with Stripe Tax. */
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const acct = await accountFor(slug);
 if (!acct) return NextResponse.json({ error: "Connect payments before adding a tax registration." }, { status: 400 });

 const body = await request.json().catch(() => null);
 const country = String(body?.country || "").trim().toUpperCase();
 const state = body?.state ? String(body.state).trim().toUpperCase() : null;
 if (!/^[A-Z]{2}$/.test(country)) return NextResponse.json({ error: "Pick a country." }, { status: 400 });

 // Stripe refuses registrations until the account has a tax head office, and these are Express
 // accounts whose dashboard has no Tax Settings page — so the platform sets it, from the ship-from
 // address she has already given VYA. Pointing her at a Stripe screen she can't open is not an option.
 const shipping = await getShippingSettings(slug).catch(() => null);
 const head = await ensureTaxHeadOffice(acct, shipping?.shipFrom ?? {});
 if (!head.ok && head.error === "needs-address") {
  return NextResponse.json({ error: "Add your ship-from address under Shipping & duties first — tax registrations are tied to where your store is based." }, { status: 400 });
 }

 const r = await addTaxRegistration(acct, country, state);
 if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
 return NextResponse.json({ ok: true, registrations: await listTaxRegistrations(acct) });
}

/** DELETE ?id= — Stripe expires rather than deletes, so the historic record survives. */
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const acct = await accountFor(slug);
 if (!acct) return NextResponse.json({ error: "No payments account." }, { status: 400 });
 const id = new URL(request.url).searchParams.get("id") || "";
 if (!id) return NextResponse.json({ error: "Which registration?" }, { status: 400 });
 if (!(await endTaxRegistration(acct, id))) return NextResponse.json({ error: "Stripe wouldn’t end that registration." }, { status: 502 });
 return NextResponse.json({ ok: true, registrations: await listTaxRegistrations(acct) });
}
