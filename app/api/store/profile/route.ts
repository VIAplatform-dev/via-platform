import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getStoreProfile, updateStoreProfile } from "@/app/lib/store-profile-db";

export const dynamic = "force-dynamic";

// A store's identity as a business, and what it promises its buyers.
//
// Two screens share this — Store details and Policies — so every field is optional on the way in
// and updateStoreProfile merges rather than replaces. Saving a phone number must not blank a
// returns policy, and the two pages have no idea about each other's fields.

export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 return NextResponse.json({ ok: true, profile: await getStoreProfile(slug) });
}

export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 if (!body || typeof body !== "object") return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

 // An email that isn't one would end up on receipts and customs paperwork, so it's checked here
 // rather than trusted — but an empty string is allowed, because clearing a field is a valid edit.
 const email = typeof body.supportEmail === "string" ? body.supportEmail.trim() : undefined;
 if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  return NextResponse.json({ error: "That support email doesn’t look right." }, { status: 400 });
 }

 const profile = await updateStoreProfile(slug, {
  ...(typeof body.displayName === "string" ? { displayName: body.displayName } : {}),
  ...(typeof body.legalName === "string" ? { legalName: body.legalName } : {}),
  ...(typeof body.location === "string" ? { location: body.location } : {}),
  ...(typeof body.bio === "string" ? { bio: body.bio } : {}),
  ...(email !== undefined ? { supportEmail: email } : {}),
  ...(typeof body.supportPhone === "string" ? { supportPhone: body.supportPhone } : {}),
  ...(typeof body.companyNumber === "string" ? { companyNumber: body.companyNumber } : {}),
  ...(typeof body.vatNumber === "string" ? { vatNumber: body.vatNumber } : {}),
  ...(body.policies && typeof body.policies === "object" ? { policies: body.policies } : {}),
 });

 return NextResponse.json({ ok: true, profile });
}
