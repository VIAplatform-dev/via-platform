import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { resolveStoreSender } from "@/app/lib/email-settings-db";
import { campaignEmailHtml, getStoreEmailBrand, sanitizeBrand } from "@/app/lib/email";

export const dynamic = "force-dynamic";

// POST { body, link? } — render the exact email HTML a store's campaign/automation will send,
// for the in-browser preview. Same renderer as the real send, so preview == inbox.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const b = await request.json().catch(() => ({}));
 const { fromName, website } = await resolveStoreSender(slug);
 const link = (String(b?.link || "").trim() || website) || undefined;
 // A live brand override (from the Email design editor) previews unsaved edits; else the saved brand.
 const brand = b?.brand ? (sanitizeBrand(b.brand) ?? undefined) : undefined;
 const html = campaignEmailHtml({ storeName: fromName, body: String(b?.body || "").slice(0, 10000), link, brand: brand ?? (await getStoreEmailBrand(slug)) });
 return NextResponse.json({ ok: true, html, storeName: fromName });
}
