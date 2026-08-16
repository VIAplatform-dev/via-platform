import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { listConsignors, createConsignor, updateConsignor, getConsignor, getConsignorBalanceCents, deleteConsignor } from "@/app/lib/consignment-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The store's consignors — the people who bring items in. Scoped to the current store.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const consignors = await listConsignors(slug);
 const withBalance = await Promise.all(consignors.map(async (c) => ({ ...c, balanceCents: await getConsignorBalanceCents(c.id) })));
 return NextResponse.json({ consignors: withBalance });
}

export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const name = typeof body?.name === "string" ? body.name.trim() : "";
 if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });
 const consignor = await createConsignor(slug, {
 name,
 email: typeof body?.email === "string" ? body.email.trim() || null : null,
 phone: typeof body?.phone === "string" ? body.phone.trim() || null : null,
 defaultSplitPct: typeof body?.defaultSplitPct === "number" ? body.defaultSplitPct : null,
 payoutMethod: typeof body?.payoutMethod === "string" ? body.payoutMethod : null,
 });
 return NextResponse.json({ consignor });
}

export async function PATCH(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 const id = Number(body?.id);
 if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
 const cur = await getConsignor(id);
 if (!cur || cur.storeSlug !== slug) return NextResponse.json({ error: "Not found" }, { status: 404 });

 // Lock the payout method once there's a balance: whether a sale's cut was routed into VYA's
 // balance (Stripe) or left with the store (cash/credit) was decided AT the sale — switching now
 // would mismatch what's actually held. Pay the consignor out first, then change it.
 if ("payoutMethod" in body && (body.payoutMethod || null) !== (cur.payoutMethod || null)) {
 const bal = await getConsignorBalanceCents(id).catch(() => 0);
 if (bal !== 0) return NextResponse.json({ error: "Can’t change payout method while this consignor has a balance — pay it out first, then switch." }, { status: 409 });
 }

 await updateConsignor(id, {
 name: typeof body?.name === "string" ? body.name.trim() : undefined,
 email: "email" in body ? (body.email || null) : undefined,
 phone: "phone" in body ? (body.phone || null) : undefined,
 defaultSplitPct: "defaultSplitPct" in body ? (typeof body.defaultSplitPct === "number" ? body.defaultSplitPct : null) : undefined,
 payoutMethod: "payoutMethod" in body ? (body.payoutMethod || null) : undefined,
 status: typeof body?.status === "string" ? body.status : undefined,
 });
 return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const id = Number(new URL(request.url).searchParams.get("id"));
 if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
 const cur = await getConsignor(id);
 if (!cur || cur.storeSlug !== slug) return NextResponse.json({ error: "Not found" }, { status: 404 });
 await deleteConsignor(id);
 return NextResponse.json({ ok: true });
}
