import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { resolveStoreSender } from "@/app/lib/email-settings-db";
import { getEmailBrandOverrides, setEmailBrandOverrides, revertEmailBrand, hasEmailBrandUndo } from "@/app/lib/email-settings-db";
import { getStoreEmailBrand, getStorefrontEmailBrand, sanitizeBrand } from "@/app/lib/email";

export const dynamic = "force-dynamic";

// The store's saved email design (colours, type, logo, button, footer) — reusable across every
// campaign and automation. Inherits the storefront brand until the store saves a custom one.

// GET — the effective brand, the storefront brand it can snap back to, and whether it's customized.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const [brand, storefront, saved, sender, canUndo] = await Promise.all([
 getStoreEmailBrand(slug),
 getStorefrontEmailBrand(slug),
 getEmailBrandOverrides(slug).catch(() => null),
 resolveStoreSender(slug),
 hasEmailBrandUndo(slug).catch(() => false),
 ]);
 return NextResponse.json({ ok: true, brand, storefront, custom: !!saved, storeName: sender.fromName, canUndo });
}

// PUT — { brand } saves a custom design · { reset:true } reverts to the storefront brand ·
// { undo:true } undoes the last change (swaps back; a second undo redoes it).
export async function PUT(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => ({}));
 if (body?.undo) {
 const { reverted, brand } = await revertEmailBrand(slug);
 const effective = brand ?? (await getStorefrontEmailBrand(slug));
 return NextResponse.json({ ok: true, reverted, custom: brand != null, brand: effective, canUndo: true });
 }
 if (body?.reset) {
 await setEmailBrandOverrides(slug, null);
 const storefront = await getStorefrontEmailBrand(slug);
 return NextResponse.json({ ok: true, custom: false, brand: storefront, canUndo: true });
 }
 const clean = sanitizeBrand(body?.brand);
 if (!clean) return NextResponse.json({ error: "Invalid design." }, { status: 400 });
 await setEmailBrandOverrides(slug, clean);
 return NextResponse.json({ ok: true, custom: true, brand: clean, canUndo: true });
}

