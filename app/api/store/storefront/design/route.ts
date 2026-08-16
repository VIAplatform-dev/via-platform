import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getStorefrontBySlug, setStorefrontTheme, upsertStorefront, normalizeHandle } from "@/app/lib/storefront-db";
import { STOREFRONT_TEMPLATES, getTemplate, HEADING_FONTS, BODY_FONTS } from "@/app/lib/storefront-templates";
import { BLOCK_TYPES, sanitizeBlocks, sanitizePages } from "@/app/lib/storefront-blocks";
import { getListingsByStore } from "@/app/lib/listings-db";
import { defaultStarterTheme } from "@/app/lib/storefront-default";
import { stores } from "@/app/lib/stores";
import type { StorefrontTheme } from "@/app/lib/store-import";

export const dynamic = "force-dynamic";
const HEX = /^#[0-9a-fA-F]{6}$/;

// GET — current design (template + colors + fonts), the options, and a few of the
// store's real products so the editor can show a true-to-life live preview.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const sf = await getStorefrontBySlug(slug);
 let theme: StorefrontTheme = sf?.theme ?? {};
 // Every store starts with the polished base — seed it the first time the storefront
 // is opened with no sections yet, keeping any template the seller already picked.
 if (!theme.blocks?.length) {
 const name = stores.find((s) => s.slug === slug)?.name || slug.replace(/-/g, " ");
 const d = defaultStarterTheme(name);
 theme = theme.template ? { ...d, template: theme.template, colors: theme.colors, fonts: theme.fonts } : d;
 await setStorefrontTheme(slug, theme).catch(() => {});
 }
 const listings = await getListingsByStore(slug, true).catch(() => []);
 const products = listings
 .filter((l) => l.images?.[0])
 .slice(0, 6)
 .map((l) => ({ title: l.title, price: l.price, currency: l.currency, image: l.images[0] }));
 return NextResponse.json({
 template: theme.template ?? null,
 colors: { bg: theme.colors?.bg || "#FFFDF8", text: theme.colors?.text || "#1a1a1a", accent: theme.colors?.accent || "#5D0F17" },
 fonts: { heading: theme.fonts?.heading || "Playfair Display", body: theme.fonts?.body || "Inter" },
 radius: theme.radius || "sharp",
 customCss: theme.customCss ?? "",
 blocks: theme.blocks ?? [],
 shopBlocks: theme.shopBlocks ?? [],
 extraPages: theme.extraPages ?? [],
 storeName: sf?.theme?.storeName || sf?.tagline || null,
 tagline: sf?.tagline || null,
 templates: STOREFRONT_TEMPLATES,
 blockTypes: BLOCK_TYPES,
 headingFonts: HEADING_FONTS,
 bodyFonts: BODY_FONTS,
 products,
 });
}

// POST { template?, colors?, fonts? } — apply a template and/or save customizations.
// A template seeds colors + fonts; explicit colors/fonts override on top (so a store
// can start from a template and tweak from there). All write the storefront theme.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null);

 // Ensure a storefront row exists (a brand-new store may not have one yet).
 let sf = await getStorefrontBySlug(slug);
 if (!sf) sf = await upsertStorefront(slug, { handle: normalizeHandle(slug), enabled: false, tagline: "", accentColor: "#5D0F17", heroImage: "", about: "" });

 const theme: StorefrontTheme = { ...(sf.theme ?? {}) };

 if (body?.template) {
 const t = getTemplate(String(body.template));
 if (t) { theme.template = t.id; theme.colors = { ...t.colors }; theme.fonts = { ...t.fonts }; }
 }
 if (body?.colors) {
 const c = body.colors;
 theme.colors = {
 bg: HEX.test(c.bg) ? c.bg : theme.colors?.bg || "#FFFDF8",
 text: HEX.test(c.text) ? c.text : theme.colors?.text || "#1a1a1a",
 accent: HEX.test(c.accent) ? c.accent : theme.colors?.accent || "#5D0F17",
 };
 }
 if (body?.fonts) {
 const f = body.fonts;
 theme.fonts = {
 heading: HEADING_FONTS.includes(f.heading) ? f.heading : theme.fonts?.heading || "Playfair Display",
 body: BODY_FONTS.includes(f.body) ? f.body : theme.fonts?.body || "Inter",
 };
 }

 if (body?.radius === "sharp" || body?.radius === "soft" || body?.radius === "round") theme.radius = body.radius;

 if (Array.isArray(body?.blocks)) theme.blocks = sanitizeBlocks(body.blocks);
 if (Array.isArray(body?.shopBlocks)) theme.shopBlocks = sanitizeBlocks(body.shopBlocks);
 if (Array.isArray(body?.extraPages)) theme.extraPages = sanitizePages(body.extraPages);
 if (typeof body?.customCss === "string") theme.customCss = body.customCss.slice(0, 20000);

 await setStorefrontTheme(slug, theme);
 return NextResponse.json({ ok: true, template: theme.template ?? null, colors: theme.colors, fonts: theme.fonts, radius: theme.radius ?? "sharp", customCss: theme.customCss ?? "", blocks: theme.blocks ?? [], shopBlocks: theme.shopBlocks ?? [], extraPages: theme.extraPages ?? [] });
}
