import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getInboxSettings, updateInboxSettings } from "@/app/lib/storefront-settings-db";
import { linqConfigured } from "@/app/lib/linq";

export const dynamic = "force-dynamic";

// GET — this store's inbox/offers settings. `smsAvailable` reflects whether text notifications are
// actually wired on the server (Linq env set) so the UI can be honest about the "Text me" toggle.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 return NextResponse.json({ ok: true, settings: { ...(await getInboxSettings(slug)), smsAvailable: linqConfigured() } });
}

// PUT — update any subset of { messagingEnabled, offersEnabled, offersBinding, minOfferPct }.
export async function PUT(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const b = await request.json().catch(() => ({}));
 const patch: Record<string, unknown> = {};
 if (typeof b?.messagingEnabled === "boolean") patch.messagingEnabled = b.messagingEnabled;
 if (typeof b?.offersEnabled === "boolean") patch.offersEnabled = b.offersEnabled;
 if (typeof b?.offersBinding === "boolean") patch.offersBinding = b.offersBinding;
 if (typeof b?.minOfferPct === "number") patch.minOfferPct = b.minOfferPct;
 if (typeof b?.notifyPhone === "string" || b?.notifyPhone === null) patch.notifyPhone = b.notifyPhone;
 if (typeof b?.notifySms === "boolean") patch.notifySms = b.notifySms;
 const settings = await updateInboxSettings(slug, patch);
 return NextResponse.json({ ok: true, settings });
}
