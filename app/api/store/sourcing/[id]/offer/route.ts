import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { storeSlugForEmail } from "@/app/lib/store-users-db";
import { storeContactEmails, stores } from "@/app/lib/stores";
import { getSourcingRequestById } from "@/app/lib/sourcing-db";
import { createSourcingOffer, hasStoreSubmittedOffer } from "@/app/lib/sourcing-offers-db";
import { sendSourcingOfferToCustomer } from "@/app/lib/email";

/**
 * Which shop this person is acting for.
 *
 * store_users FIRST, the hardcoded roster second — the same order storeAuth.ts uses, for the same
 * reason. These routes read the static map alone, which is a list of OWNER addresses: a teammate
 * invited into a shop exists only in store_users, so sourcing told her she was unauthorised in a
 * workspace she had just been given access to.
 */
async function getStoreSlugFromEmail(email: string): Promise<string | null> {
 const fromUsers = await storeSlugForEmail(email).catch(() => null); /* allow-swallow: degrade to the roster, never lock a seller out */
 if (fromUsers) return fromUsers;
 for (const [slug, storeEmail] of Object.entries(storeContactEmails)) {
 if (storeEmail && storeEmail.toLowerCase() === email.toLowerCase()) return slug;
 }
 return null;
}

function getStoreNameFromSlug(slug: string): string {
 return stores.find((s) => s.slug === slug)?.name ?? slug;
}

export async function POST(
 request: NextRequest,
 { params }: { params: Promise<{ id: string }> }
) {
 const session = await auth();
 if (!session?.user?.email) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const storeSlug = await getStoreSlugFromEmail(session.user.email);
 if (!storeSlug) {
 return NextResponse.json({ error: "Not a registered store partner" }, { status: 403 });
 }

 const { id: requestId } = await params;

 // Parse and validate body
 const body = await request.json().catch(() => null);
 if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

 const fee = Number(body.fee);
 const timeline = String(body.timeline ?? "").trim();
 const notes = body.notes ? String(body.notes).trim() || null : null;
 const expectedPriceMin = body.expectedPriceMin ? Number(body.expectedPriceMin) : null;
 const expectedPriceMax = body.expectedPriceMax ? Number(body.expectedPriceMax) : null;

 if (!fee || fee <= 0 || !Number.isInteger(fee)) {
 return NextResponse.json({ error: "Fee must be a positive whole number" }, { status: 400 });
 }
 if (!timeline) {
 return NextResponse.json({ error: "Timeline is required" }, { status: 400 });
 }

 // Check store hasn't already submitted an offer for this request
 const alreadySubmitted = await hasStoreSubmittedOffer(requestId, storeSlug);
 if (alreadySubmitted) {
 return NextResponse.json({ error: "You have already submitted an offer for this request" }, { status: 409 });
 }

 // Fetch request to get customer email (no userId check — stores can see open requests)
 // We use a raw DB lookup via sourcing-db helper that doesn't filter by user
 const { neon } = await import("@neondatabase/serverless");
 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || "");
 const rows = await sql`
 SELECT id, user_email, user_name, description, status
 FROM sourcing_requests
 WHERE id = ${requestId} AND status = 'paid' AND matched_store_slug IS NULL
 LIMIT 1
 `;
 if (rows.length === 0) {
 return NextResponse.json({ error: "Request not found or no longer available" }, { status: 404 });
 }
 const req = rows[0];

 const storeName = getStoreNameFromSlug(storeSlug);
 const storeEmail = storeContactEmails[storeSlug] ?? "";

 const offer = await createSourcingOffer({
 requestId,
 storeSlug,
 storeName,
 storeEmail,
 fee,
 timeline,
 notes,
 expectedPriceMin,
 expectedPriceMax,
 });

 // Email the customer
 await sendSourcingOfferToCustomer({
 customerEmail: req.user_email as string,
 customerName: req.user_name as string | null,
 storeName,
 fee,
 timeline,
 notes,
 requestDescription: req.description as string,
 requestId,
 });

 return NextResponse.json({ success: true, offer });
}
