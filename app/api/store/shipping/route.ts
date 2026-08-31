import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getShippingSettings, setShippingSettings, type ShipMode, type ShipFrom } from "@/app/lib/store-shipping-db";
import { pickupOffered } from "@/app/lib/pickup-core.ts";

export const dynamic = "force-dynamic";

const MODES = ["buyer_pays", "store_pays", "free_over"];

// GET — this store's shipping policy (mode, threshold, ship-from address).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const s = await getShippingSettings(slug);
 return NextResponse.json({
  mode: s.mode,
  freeThresholdUsd: s.freeThresholdCents != null ? s.freeThresholdCents / 100 : null,
  shipFrom: s.shipFrom,
  // Collect in store. `offered` is the truth the shopper's checkout uses — the toggle alone isn't it.
  pickup: s.pickup,
  pickupOffered: pickupOffered(s.pickup),
 });
}

// POST { mode, freeThresholdUsd, shipFrom } — set the policy (each store its own).
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);

 const mode = (MODES.includes(body?.mode) ? body.mode : "buyer_pays") as ShipMode;
 const threshUsd = Number(body?.freeThresholdUsd);
 const freeThresholdCents = mode === "free_over" && Number.isFinite(threshUsd) && threshUsd > 0 ? Math.round(threshUsd * 100) : null;

 const f = body?.shipFrom || {};
 const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
 const shipFrom: ShipFrom = {
 name: str(f.name), street1: str(f.street1), street2: str(f.street2), city: str(f.city),
 state: str(f.state), zip: str(f.zip), country: str(f.country) || "US", phone: str(f.phone),
 };

 // Collect in store. Saved as the seller typed it; whether it is actually OFFERED is decided by
 // pickupOffered, which requires somewhere to collect from — a toggle with no address is not an
 // offer, and that is the likeliest way this setting goes wrong.
 const pk = body?.pickup || {};
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

 await setShippingSettings(slug, { mode, freeThresholdCents, shipFrom, pickup });
 return NextResponse.json({ ok: true, pickupOffered: pickupOffered(pickup) });
}
