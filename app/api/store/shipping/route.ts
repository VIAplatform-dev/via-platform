import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getShippingSettings, setShippingSettings, type ShipMode, type ShipFrom } from "@/app/lib/store-shipping-db";
import { pickupOffered } from "@/app/lib/pickup-core.ts";
import { isDutyMode, resolveDutyMode, DEFAULT_DUTY_MODE } from "@/app/lib/customs";
import { normalizeZones, DEFAULT_ZONES } from "@/app/lib/shipping-zones";
import { SHIPPING_TIERS } from "@/app/lib/shipping-tiers";
import { ensureTaxHeadOffice } from "@/app/lib/store-tax-db";
import { getSellerPayments } from "@/app/lib/seller-payments-db";
import { payableAccountId } from "@/app/lib/stripe-mode";

export const dynamic = "force-dynamic";

const MODES = ["buyer_pays", "store_pays", "free_over"];

// GET — this store's shipping policy (mode, threshold, ship-from address).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const s = await getShippingSettings(slug);
 const effective = resolveDutyMode(s.dutyMode ?? DEFAULT_DUTY_MODE, Boolean(s.carrierAccountId));
 return NextResponse.json({
  mode: s.mode,
  freeThresholdUsd: s.freeThresholdCents != null ? s.freeThresholdCents / 100 : null,
  shipFrom: s.shipFrom,
  // Collect in store. `offered` is the truth the shopper's checkout uses — the toggle alone isn't it.
  pickup: s.pickup,
  pickupOffered: pickupOffered(s.pickup),
  // International. `dutyMode` is what she CHOSE; `effectiveDutyMode` is what will actually happen,
  // which differs whenever she asked to cover duty without her own carrier account — see
  // resolveDutyMode. Showing only the choice would let her promise something VYA isn't doing.
  dutyMode: s.dutyMode ?? DEFAULT_DUTY_MODE,
  effectiveDutyMode: effective.mode,
  dutyDowngraded: effective.downgraded,
  carrierConnected: Boolean(s.carrierAccountId),
  zones: s.zones ?? DEFAULT_ZONES,
  tiers: SHIPPING_TIERS.map((t) => ({ id: t.id, label: t.label, priceCents: t.priceCents, examples: t.examples })),
 });
}

// POST { mode, freeThresholdUsd, shipFrom } — set the policy (each store its own).
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);

 // MERGE, don't replace. Several screens save into these settings — Shipping & duties, Locations —
 // and each sends only its own fields. Defaulting the rest would let saving an address silently
 // reset the shipping zones, which is the kind of loss nobody notices until an order is refused.
 const existing = await getShippingSettings(slug).catch(() => null);
 const has = (k: string) => body != null && Object.prototype.hasOwnProperty.call(body, k);

 const mode = (MODES.includes(body?.mode) ? body.mode : existing?.mode ?? "buyer_pays") as ShipMode;
 const threshUsd = Number(body?.freeThresholdUsd);
 const freeThresholdCents = mode === "free_over"
  ? (Number.isFinite(threshUsd) && threshUsd > 0 ? Math.round(threshUsd * 100) : existing?.freeThresholdCents ?? null)
  : null;

 const dutyMode = isDutyMode(body?.dutyMode) ? body.dutyMode : existing?.dutyMode ?? DEFAULT_DUTY_MODE;
 // Zones say both WHERE she ships and what she charges; normalizeZones refuses junk and can never
 // produce a store that ships nowhere.
 const zones = has("zones") ? normalizeZones(body?.zones) : existing?.zones ?? undefined;

 const f = has("shipFrom") ? body?.shipFrom || {} : existing?.shipFrom || {};
 const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
 const shipFrom: ShipFrom = {
 name: str(f.name), street1: str(f.street1), street2: str(f.street2), city: str(f.city),
 state: str(f.state), zip: str(f.zip), country: str(f.country) || "US", phone: str(f.phone),
 };

 // Collect in store. Saved as the seller typed it; whether it is actually OFFERED is decided by
 // pickupOffered, which requires somewhere to collect from — a toggle with no address is not an
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
 await setShippingSettings(slug, { mode, freeThresholdCents, shipFrom, pickup, dutyMode, carrierAccountId: existing?.carrierAccountId ?? null, zones });
 // Tell Stripe Tax where the store is established as soon as we know. These are Express accounts —
 // their dashboard has no Tax Settings page — so if the platform doesn't set this, nobody can, and
 // the seller meets a Stripe error pointing at a screen she can't open. Best-effort: a shipping save
 // must not fail because Stripe was briefly unhappy.
 if (shipFrom.street1 && shipFrom.city && shipFrom.country) {
  const acct = payableAccountId(await getSellerPayments(slug).catch(() => null));
  if (acct) await ensureTaxHeadOffice(acct, shipFrom).catch(() => null);
 }
 const effective = resolveDutyMode(dutyMode, Boolean(existing?.carrierAccountId));
 return NextResponse.json({ ok: true, pickupOffered: pickupOffered(pickup), effectiveDutyMode: effective.mode, dutyDowngraded: effective.downgraded });
}
