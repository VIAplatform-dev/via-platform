import { NextResponse } from "next/server";
import { getConsignorEmail, CONSIGNOR_COOKIE } from "@/app/lib/consignor-auth";
import { getConsignorsByEmail, getConsignorStatement, getConsignmentSettings, getPayableBalanceCents } from "@/app/lib/consignment-db";
import { stores } from "@/app/lib/stores";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The signed-in consignor's statement(s) — one per store they consign with. Gated by the
// session cookie, and only ever returns records whose email matches the session.
export async function GET(request: Request) {
 const email = getConsignorEmail(request);
 if (!email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
 const consignors = await getConsignorsByEmail(email);
 const consignments = await Promise.all(consignors.map(async (c) => {
 const s = await getConsignorStatement(c.id);
 const settings = await getConsignmentSettings(c.storeSlug).catch(() => null);
 // Effective payout method (the consignor's own, else the store's default) + what's cleared the
 // return hold and is actually ready to collect/receive right now.
 const payoutMethod = c.payoutMethod || settings?.defaultPayoutMethod || "store_credit";
 const payableCents = await getPayableBalanceCents(c.id, settings?.holdDays ?? 14).catch(() => 0);
 const storeName = stores.find((st) => st.slug === c.storeSlug)?.name || c.storeSlug;
 return {
 consignorId: c.id,
 store: c.storeSlug,
 storeName,
 name: c.name,
 connected: !!c.stripeAccountId,
 payoutMethod,
 payableCents,
 balanceCents: s.balanceCents,
 items: s.items.map((i) => ({ status: i.status, splitPct: i.splitPct, listedPriceCents: i.listedPriceCents, soldPriceCents: i.soldPriceCents, intakeDate: i.intakeDate, soldAt: i.soldAt })),
 ledger: s.ledger,
 payouts: s.payouts.map((p) => ({ amountCents: p.amountCents, method: p.method, status: p.status, createdAt: p.createdAt })),
 };
 }));
 return NextResponse.json({ email, consignments });
}

// Sign out — clear the session cookie.
export async function DELETE() {
 const res = NextResponse.json({ ok: true });
 res.cookies.set(CONSIGNOR_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
 return res;
}
