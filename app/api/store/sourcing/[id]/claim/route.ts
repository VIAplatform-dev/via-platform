import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { storeSlugForEmail } from "@/app/lib/store-users-db";
import { storeContactEmails } from "@/app/lib/stores";
import { claimSourcingRequest } from "@/app/lib/sourcing-db";

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

export async function POST(
 _request: NextRequest,
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

 const { id } = await params;
 const result = await claimSourcingRequest(id, storeSlug);

 if (!result.success) {
 return NextResponse.json({ error: result.error }, { status: 409 });
 }

 return NextResponse.json({ success: true });
}
