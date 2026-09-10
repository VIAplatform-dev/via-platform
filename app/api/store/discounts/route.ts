import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { listDiscounts, addDiscount, updateDiscount, deleteDiscount, redemptionCount } from "@/app/lib/store-discounts-db";

export const dynamic = "force-dynamic";

async function slugOr401(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 return slug;
}

// Each discount plus how many times it's been redeemed at native checkout.
async function withUsage(slug: string) {
 const ds = await listDiscounts(slug).catch(() => []);
 return Promise.all(ds.map(async (d) => ({ ...d, used: await redemptionCount(slug, d.code).catch(() => 0) })));
}

export async function GET(request: NextRequest) {
 const slug = await slugOr401(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const discounts = await withUsage(slug);
 return NextResponse.json({ ok: true, discounts });
}

export async function POST(request: NextRequest) {
 const slug = await slugOr401(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 if (!body || !String(body.code || "").trim()) return NextResponse.json({ error: "Add a code." }, { status: 400 });
 const d = await addDiscount(slug, { code: body.code, label: body.label, kind: body.kind, value: body.value, endsAt: body.endsAt, itemIds: body.itemIds, audience: body.audience, lapsedDays: body.lapsedDays });
 if (!d) return NextResponse.json({ error: "Invalid code." }, { status: 400 });
 const discounts = await withUsage(slug);
 return NextResponse.json({ ok: true, discounts });
}

export async function PATCH(request: NextRequest) {
 const slug = await slugOr401(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 if (!body || !body.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
 // Only the fields actually sent are written, so switching a code off never blanks its percentage.
 await updateDiscount(slug, Number(body.id), {
 active: body.active, autoApply: body.autoApply,
 ...("code" in body ? { code: String(body.code ?? "") } : {}),
 ...("label" in body ? { label: body.label == null ? null : String(body.label) } : {}),
 ...("kind" in body ? { kind: String(body.kind ?? "") } : {}),
 ...("value" in body ? { value: body.value === "" || body.value == null ? null : Number(body.value) } : {}),
 ...("endsAt" in body ? { endsAt: body.endsAt ? String(body.endsAt) : null } : {}),
 ...("itemIds" in body ? { itemIds: Array.isArray(body.itemIds) ? body.itemIds.map(String) : [] } : {}),
 ...("audience" in body ? { audience: body.audience == null ? "all" : String(body.audience) } : {}),
 ...("lapsedDays" in body ? { lapsedDays: body.lapsedDays == null || body.lapsedDays === "" ? null : Number(body.lapsedDays) } : {}),
 }).catch(() => {});
 const discounts = await withUsage(slug);
 return NextResponse.json({ ok: true, discounts });
}

export async function DELETE(request: NextRequest) {
 const slug = await slugOr401(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);
 if (!body || !body.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
 await deleteDiscount(slug, Number(body.id)).catch(() => {});
 const discounts = await withUsage(slug);
 return NextResponse.json({ ok: true, discounts });
}
