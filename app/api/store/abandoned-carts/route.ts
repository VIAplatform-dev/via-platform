import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getStoreCheckoutAttempts, getCheckoutAttempt, markCartEmailed } from "@/app/lib/checkout-attempts-db";
import { sendAbandonedCartEmail } from "@/app/lib/automation-engine";

export const dynamic = "force-dynamic";

// GET — the store's cart-recovery list: shoppers who started checkout but didn't finish, with status
// (pending → emailed → recovered) so the seller can follow up on high-intent pieces.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const attempts = await getStoreCheckoutAttempts(slug, 200);
 const summary = { pending: 0, emailed: 0, recovered: 0 };
 for (const a of attempts) if (a.status in summary) summary[a.status] += 1;
 return NextResponse.json({ ok: true, attempts, summary });
}

// POST { id } — manually send a recovery email to that shopper (bypasses the automation toggle).
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const id = Number(body?.id);
 if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

 const cart = await getCheckoutAttempt(id, slug);
 if (!cart) return NextResponse.json({ error: "Not found" }, { status: 404 });

 const sent = await sendAbandonedCartEmail(cart, { force: true });
 if (!sent) return NextResponse.json({ error: "Couldn’t send — set up your store email in Settings → Email first." }, { status: 400 });
 await markCartEmailed(id);
 return NextResponse.json({ ok: true });
}
