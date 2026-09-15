import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getShippingSettings, setShippingSettings, type ShipMode, type ShipFrom } from "@/app/lib/store-shipping-db";
import { pickupOffered } from "@/app/lib/pickup-core.ts";
import { isDutyMode, resolveDutyMode, DEFAULT_DUTY_MODE } from "@/app/lib/customs";
import { isLabelPrinter, DEFAULT_LABEL_PRINTER } from "@/app/lib/label-format-core";
import { ZONE_IDS, normalizeZones, DEFAULT_ZONES } from "@/app/lib/shipping-zones";
import { SHIPPING_TIERS } from "@/app/lib/shipping-tiers";
import { storeHasCardOnFile, billsTheStore } from "@/app/lib/store-card";
import { zoneTierDefaults } from "@/app/lib/shipping-prices-core";
import { barredDestinations } from "@/app/lib/shipping-embargo";
import { getStoreProfile, updateStoreProfile } from "@/app/lib/store-profile-db";
import { resolveStoreCurrency, currencyToAdoptOnAddress } from "@/app/lib/store-currency";
import { describeZoneCoverage } from "@/app/lib/ships-to-core";
import { stores } from "@/app/lib/stores";
import { ensureTaxHeadOffice } from "@/app/lib/store-tax-db";
import { getSellerPayments } from "@/app/lib/seller-payments-db";
import { payableAccountId } from "@/app/lib/stripe-mode";

export const dynamic = "force-dynamic";

const MODES = ["buyer_pays", "store_pays", "free_over"];

// GET: this store's shipping policy (mode, threshold, ship-from address).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const s = await getShippingSettings(slug);
 const effective = resolveDutyMode(s.dutyMode ?? DEFAULT_DUTY_MODE, Boolean(s.carrierAccountId));
 // The store's currency, so the settings page prints "£" for a London store and never a "$" it
 // doesn't trade in. Every price below is minor units of THIS currency.
 // Same source publish uses for a listing's currency (intake/publish/route.ts).
 // NOT the hardcoded partner array on its own. That list predates every store that has signed up
 // since, so all of them read "USD" whatever address they had typed: a London seller priced a coat
 // at 240 and her whole workspace said $240. Her own choice first, then her ship-from country,
 // then the old list for the original shops (store-currency.ts).
 const profile = await getStoreProfile(slug).catch(() => null);
 const currency = resolveStoreCurrency({
  chosen: profile?.currency,
  shipFromCountry: s.shipFrom?.country,
  legacy: stores.find((x) => x.slug === slug)?.currency,
 });
 return NextResponse.json({
  currency,
  mode: s.mode,
  freeThresholdUsd: s.freeThresholdCents != null ? s.freeThresholdCents / 100 : null,
  shipFrom: s.shipFrom,
  // Collect in store. `offered` is the truth the shopper's checkout uses. The toggle alone isn't it.
  pickup: s.pickup,
  pickupOffered: pickupOffered(s.pickup),
  // International. `dutyMode` is what she CHOSE; `effectiveDutyMode` is what will actually happen,
  // which differs whenever she asked to cover duty without her own carrier account. See
  // resolveDutyMode. Showing only the choice would let her promise something VYA isn't doing.
  dutyMode: s.dutyMode ?? DEFAULT_DUTY_MODE,
  effectiveDutyMode: effective.mode,
  dutyDowngraded: effective.downgraded,
  carrierConnected: Boolean(s.carrierAccountId),
  labelPrinter: s.labelPrinter ?? DEFAULT_LABEL_PRINTER,
  expeditedOffered: s.expeditedOffered === true,
  dispatchDays: s.dispatchDays ?? null,
  pricing: s.pricing ?? "live",
  zones: s.zones ?? DEFAULT_ZONES,
  // Whether VYA can bill this store for a label. The two "you absorb it" modes are refused without
  // it: app/lib/store-card.ts says why that belongs here rather than at the printer.
  canAbsorb: await storeHasCardOnFile(slug),
  // `priceCents` is the HOME price. It used to be the only figure sent, and the settings page
  // printed it as the greyed default on every region, so Europe and North America both showed the
  // domestic rate. `defaultsByZone` carries what each region actually falls back to, worked out
  // from where this store ships FROM (shipping-prices-core.ts).
  tiers: SHIPPING_TIERS.map((t) => ({ id: t.id, label: t.label, priceCents: t.priceCents, examples: t.examples })),
  defaultsByZone: Object.fromEntries(
   ZONE_IDS.map((z) => [z, zoneTierDefaults(z, s.shipFrom?.country)]),
  ),
  // Named, so a seller never has to learn them from a customer who couldn't check out. Sent from
  // here rather than hardcoded in the app, so the phone cannot fall behind what checkout enforces.
  barred: barredDestinations().map((g) => ({ label: g.label, places: g.places.map((p) => p.name) })),
  // What each zone actually covers, in country names, worked out from where this store ships from.
  // Sent rather than hardcoded so the phone says the same thing as the web and as checkout.
  zoneCoverage: Object.fromEntries(ZONE_IDS.map((z) => [z, describeZoneCoverage(z, s.shipFrom?.country).summary])),
 });
}

// POST { mode, freeThresholdUsd, shipFrom }. Set the policy (each store its own).
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);

 // MERGE, don't replace. Several screens save into these settings, Shipping & duties, Locations,
 // and each sends only its own fields. Defaulting the rest would let saving an address silently
 // reset the shipping zones, which is the kind of loss nobody notices until an order is refused.
 const existing = await getShippingSettings(slug).catch(() => null);
 const has = (k: string) => body != null && Object.prototype.hasOwnProperty.call(body, k);

 const mode = (MODES.includes(body?.mode) ? body.mode : existing?.mode ?? "buyer_pays") as ShipMode;

 // A store cannot promise free postage it has no way to pay for: both "you absorb it" modes put
 // the label on its own card. The form disables them; this is the same rule behind the form,
 // because a disabled radio is a suggestion and a route is a rule.
 //
 // Only on the way IN to one of those modes. Blocking every save while the mode is already set
 // would refuse an unrelated address edit from Locations, and punish a store for a card that
 // expired rather than telling it.
 if (has("mode") && billsTheStore(mode) && existing?.mode !== mode && !(await storeHasCardOnFile(slug))) {
  return NextResponse.json(
   { error: "Add a card under Billing first, when you absorb shipping, the label is charged to it the moment you print it." },
   { status: 400 },
  );
 }
 const threshUsd = Number(body?.freeThresholdUsd);
 const freeThresholdCents = mode === "free_over"
  ? (Number.isFinite(threshUsd) && threshUsd > 0 ? Math.round(threshUsd * 100) : existing?.freeThresholdCents ?? null)
  : null;

 const dutyMode = isDutyMode(body?.dutyMode) ? body.dutyMode : existing?.dutyMode ?? DEFAULT_DUTY_MODE;
 const labelPrinter = isLabelPrinter(body?.labelPrinter) ? body.labelPrinter : existing?.labelPrinter ?? DEFAULT_LABEL_PRINTER;
 const expeditedOffered = has("expeditedOffered") ? body.expeditedOffered === true : existing?.expeditedOffered === true;
 // POSTAGE PRICING IS NOT THE STORE'S TO SET, so this no longer reads the body.
 //
 // VYA buys every label and the buyer's postage goes to VYA in the application fee (cart-intent),
 // so a store setting its own per-region prices was setting VYA's revenue, and VYA's loss, on a
 // cost it never pays. The settings form that offered it is gone; accepting the key anyway would
 // leave the rule living only in the UI, which is not where a rule about money belongs.
 //
 // Whatever a store already has is preserved rather than forced, and "live" is the default for
 // every store that has never had anything.
 const pricing = existing?.pricing ?? "live";
 // How long a parcel sits with her before it goes. Absent key keeps what is there; an explicit
 // null clears it back to saying nothing.
 const dispatchDays = has("dispatchDays")
  ? (Number.isFinite(Number(body?.dispatchDays)) ? Number(body?.dispatchDays) : null)
  : existing?.dispatchDays ?? null;
 // Zones say WHERE she ships, and only that now: what a parcel costs is VYA's to price, so
 // normalizeZones drops any rate that arrives and there is nothing left to validate. It refuses
 // junk and can never produce a store that ships nowhere.
 const zones = has("zones") ? normalizeZones(body?.zones) : existing?.zones ?? undefined;

 // An explicit `shipFrom: null` clears the address (back to "not set", country included); an object
 // replaces it; leaving the key out keeps what is there.
 const clearShipFrom = has("shipFrom") && body?.shipFrom === null;
 const f = has("shipFrom") ? body?.shipFrom || {} : existing?.shipFrom || {};
 const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
 const shipFrom: ShipFrom | null = clearShipFrom ? null : {
 name: str(f.name), street1: str(f.street1), street2: str(f.street2), city: str(f.city),
 state: str(f.state), zip: str(f.zip), country: str(f.country) || "US", phone: str(f.phone),
 };

 // Collect in store. Saved as the seller typed it; whether it is actually OFFERED is decided by
 // pickupOffered, which requires somewhere to collect from. A toggle with no address is not an
 // offer, and that is the likeliest way this setting goes wrong.
 const pk = has("pickup") ? body?.pickup || {} : (existing?.pickup ? { enabled: true, ...existing.pickup.address, instructions: existing.pickup.instructions } : {});
 const pickup = pk.enabled
  ? {
   enabled: true,
   address: {
    street1: str(pk.street1), street2: str(pk.street2), city: str(pk.city),
    state: str(pk.state), zip: str(pk.zip), country: str(pk.country) || "US",
   },
   instructions: typeof pk.instructions === "string" && pk.instructions.trim() ? pk.instructions.trim().slice(0, 400) : null,
  }
  : null;
 // Refuse the half-filled setting rather than saving a toggle that quietly does nothing. Without
 // this she'd flip it on, see it saved, and wonder why no shopper is ever offered collection.
 if (pk.enabled && !pickupOffered(pickup)) {
  return NextResponse.json({ error: "Add the street and city buyers will collect from before turning collection on." }, { status: 400 });
 }

 // The connected carrier account is set by /api/store/shipping/carrier; a settings save carries it.
 await setShippingSettings(slug, { mode, freeThresholdCents, shipFrom, pickup, dutyMode, carrierAccountId: existing?.carrierAccountId ?? null, zones, labelPrinter, expeditedOffered, pricing, dispatchDays });
 // Tell Stripe Tax where the store is established as soon as we know. These are Express accounts,
 // their dashboard has no Tax Settings page, so if the platform doesn't set this, nobody can, and
 // the seller meets a Stripe error pointing at a screen she can't open. Best-effort: a shipping save
 // must not fail because Stripe was briefly unhappy.
 if (shipFrom?.street1 && shipFrom.city && shipFrom.country) {
  const acct = payableAccountId(await getSellerPayments(slug).catch(() => null));
  if (acct) await ensureTaxHeadOffice(acct, shipFrom).catch(() => null);
 }
 // THE ADDRESS SETS THE CURRENCY, once, when nothing has been chosen.
 //
 // She has just told us which country she posts from, which is a far better answer than "USD" and
 // is the only one she will ever volunteer unprompted. Only when the field is empty: a seller who
 // picked her currency has answered this, and moving a studio across a border is not an instruction
 // to re-price the catalogue (store-currency.ts).
 let adoptedCurrency: string | null = null;
 if (shipFrom?.country) {
  const profile = await getStoreProfile(slug).catch(() => null);
  adoptedCurrency = currencyToAdoptOnAddress({ chosen: profile?.currency, shipFromCountry: shipFrom.country });
  // Best-effort, like the Stripe call above: a shipping save must not fail over this.
  if (adoptedCurrency) await updateStoreProfile(slug, { currency: adoptedCurrency }).catch(() => null);
 }

 const effective = resolveDutyMode(dutyMode, Boolean(existing?.carrierAccountId));
 return NextResponse.json({ ok: true, pickupOffered: pickupOffered(pickup), effectiveDutyMode: effective.mode, dutyDowngraded: effective.downgraded, adoptedCurrency });
}
