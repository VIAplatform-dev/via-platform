import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny, isAdminRequest } from "@/app/lib/storeAuth";
import { stores } from "@/app/lib/stores";
import {
 getStorefrontBySlug,
 isHandleTaken,
 upsertStorefront,
 deleteStorefront,
 normalizeHandle,
 type StorefrontSettings,
} from "@/app/lib/storefront-db";

export const dynamic = "force-dynamic";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Defaults for a store that hasn't configured a storefront yet. */
function defaultsFor(slug: string): StorefrontSettings {
 const store = stores.find((s) => s.slug === slug);
 return {
 storeSlug: slug,
 handle: slug,
 enabled: false,
 tagline: null,
 accentColor: "#5D0F17",
 heroImage: null,
 about: store?.description ? store.description.slice(0, 280) : null,
 customDomain: null,
 theme: null,
 };
}

// GET — the acting store's storefront settings (or sensible defaults), plus the
// display info the editor needs (name, logo).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const store = stores.find((s) => s.slug === slug);
 const settings = (await getStorefrontBySlug(slug)) ?? defaultsFor(slug);

 return NextResponse.json({
 ok: true,
 settings,
 store: { slug, name: store?.name ?? slug, logo: store?.logo ?? null },
 admin: isAdminRequest(request), // platform admin (your admin login) — gates the Delete action
 });
}

// POST — save the acting store's storefront settings.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 let body: Record<string, unknown>;
 try {
 body = await request.json();
 } catch {
 return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
 }

 const handle = normalizeHandle(String(body.handle || "")) || slug;
 if (handle.length < 2) {
 return NextResponse.json({ error: "Handle must be at least 2 characters." }, { status: 400 });
 }
 if (await isHandleTaken(handle, slug)) {
 return NextResponse.json({ error: "That storefront URL is already taken." }, { status: 409 });
 }

 const accentRaw = String(body.accentColor || "").trim();
 const accentColor = HEX.test(accentRaw) ? accentRaw : "#5D0F17";
 const str = (v: unknown, max: number) => {
 const s = (typeof v === "string" ? v : "").trim();
 return s ? s.slice(0, max) : null;
 };

 const saved = await upsertStorefront(slug, {
 handle,
 enabled: Boolean(body.enabled),
 tagline: str(body.tagline, 120),
 accentColor,
 heroImage: str(body.heroImage, 600),
 about: str(body.about, 1000),
 });

 return NextResponse.json({ ok: true, settings: saved });
}

// DELETE ?store=<slug> — completely remove a store's storefront (settings, theme, pages, publish
// state). The public handle stops resolving and the editor reopens blank; a fresh one can be built
// from scratch. PLATFORM ADMIN ONLY — not the store owner; only your admin login can do this.
export async function DELETE(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Admin only." }, { status: 401 });
 const slug = new URL(request.url).searchParams.get("store") || (await resolveStoreSlugAny(request));
 if (!slug) return NextResponse.json({ error: "store slug required (?store=<slug>)" }, { status: 400 });
 await deleteStorefront(slug);
 return NextResponse.json({ ok: true, deleted: slug });
}
