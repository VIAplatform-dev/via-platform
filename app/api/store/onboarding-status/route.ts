import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { stores } from "@/app/lib/stores";
import { getListingsByStore } from "@/app/lib/listings-db";
import { getSetupSkipped, setSetupSkipped } from "@/app/lib/store-profile-db";
import { isSkippableStep, setupInputFor } from "@/app/lib/setup-status-db";
import { setupSteps, setupSummary } from "@/app/lib/setup-core";

export const dynamic = "force-dynamic";

// Has this store set up yet? Onboarded = storefront published OR has any listings. Plus the
// "Set up your store" checklist (setup-core.ts) Home and the phone show until it is complete.
//
// The flags come from setup-status-db.ts, which the owner's setup funnel shares — so what a seller
// sees on Home and what the owner counts across stores can never disagree.
async function status(slug: string) {
 const [input, listings] = await Promise.all([setupInputFor(slug), getListingsByStore(slug, false).catch(() => [])]);
 const store = stores.find((s) => s.slug === slug);
 const setup = setupSteps(input);
 const summary = setupSummary(setup);
 return {
  ok: true, onboarded: input.storefrontEnabled || listings.length > 0, shipFromSet: input.shipFromSet, storeName: store?.name || slug,
  setup, setupComplete: summary.complete, setupDone: summary.done, setupTotal: summary.total, setupNext: summary.next?.id ?? null,
  setupSkipped: input.skipped ?? [],
 };
}

export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 return NextResponse.json(await status(slug));
}

// PUT { skip: "domain" } | { unskip: "domain" } — hide an OPTIONAL step from her checklist (or put
// it back). Only optional steps can be skipped; a required one answers 400. Returns the same
// payload as GET, recomputed, so the card can redraw from the response.
export async function PUT(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => ({}));
 const skip = body?.skip, unskip = body?.unskip;
 if (skip !== undefined && !isSkippableStep(skip)) return NextResponse.json({ error: "Only an optional step can be skipped." }, { status: 400 });
 if (unskip !== undefined && !isSkippableStep(unskip)) return NextResponse.json({ error: "Only an optional step can be skipped." }, { status: 400 });
 if (skip === undefined && unskip === undefined) return NextResponse.json({ error: "Say which step: { skip } or { unskip }." }, { status: 400 });
 const current = await getSetupSkipped(slug);
 const next = current.filter((id) => id !== unskip);
 if (skip && !next.includes(skip)) next.push(skip);
 await setSetupSkipped(slug, next);
 return NextResponse.json(await status(slug));
}
