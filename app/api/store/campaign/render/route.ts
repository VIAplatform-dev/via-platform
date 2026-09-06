import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { resolveStoreSender } from "@/app/lib/email-settings-db";
import { getStoreEmailBrand } from "@/app/lib/email";
import { storeEmailHtml, type EmailDesign } from "@/app/lib/email-template";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listStorefrontItems } from "@/app/lib/db/inventory";

export const dynamic = "force-dynamic";

// POST — render the email a seller is editing, exactly as it will send.
//
// The same function the real send uses. An editor whose preview is drawn by different code is an
// editor that lies, and the lie only shows up in someone's inbox.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const b = await request.json().catch(() => ({}));
 const [{ fromName }, brand, seller] = await Promise.all([
  resolveStoreSender(slug),
  getStoreEmailBrand(slug).catch(() => null),
  getSellerBySlug(slug).catch(() => null),
 ]);

 const want = Math.max(0, Math.min(8, Number(b?.pieceCount ?? 0)));
 // Specific pieces beat "the newest N" the moment a shop wants to feature something. Chosen ids win;
 // the count is the fallback for a seller who doesn't want to pick.
 const chosen: string[] = Array.isArray(b?.itemIds) ? b.itemIds.filter((x: unknown) => typeof x === "string").slice(0, 8) : [];
 let products: { title: string; image: string | null; priceLabel: string | null; url: string }[] = [];
 if ((want || chosen.length) && seller) {
  const items = await listStorefrontItems(seller.id).catch(() => []);
  const picked = chosen.length
   ? chosen.map((id) => items.find((i) => i.id === id)).filter(Boolean)
   : items.slice(0, want);
  products = (picked as typeof items).map((i) => ({
   title: i.title,
   image: (i.images as string[] | null)?.[0] ?? null,
   priceLabel: i.priceCents == null ? null : `$${Math.round(i.priceCents / 100).toLocaleString()}`,
   url: b?.link || "https://example.com",
  }));
 }

 // The row of underlined links near the bottom — collections, or anywhere the shop wants people.
 const links = (Array.isArray(b?.links) ? b.links : [])
  .filter((l: unknown): l is { label: string; url: string } =>
   Boolean(l && typeof (l as { label?: unknown }).label === "string" && typeof (l as { url?: unknown }).url === "string"))
  .slice(0, 4);

 const html = storeEmailHtml({
  storeName: fromName,
  logo: brand?.logo ?? null,
  design: (b?.design || "classic") as EmailDesign,
  ground: b?.ground === "brand" ? "brand" : "white",
  showPrices: b?.showPrices !== false,
  eyebrow: b?.eyebrow || null,
  preheader: b?.preheader || null,
  productsHeading: b?.productsHeading || null,
  code: b?.code || null,
  linksHeading: links.length ? (b?.linksHeading || null) : null,
  links,
  headline: String(b?.headline || "").slice(0, 160) || "Your headline",
  subhead: b?.subhead ? String(b.subhead).slice(0, 300) : null,
  button: b?.ctaLabel ? { label: String(b.ctaLabel).slice(0, 40), url: b?.link || "https://example.com" } : null,
  // Pieces go in a band when the seller gave the band a heading, and inline otherwise — the bands
  // are what let one email carry eight pieces without reading as a dump.
  products: b?.productsHeading ? [] : products,
  sections: b?.productsHeading && products.length
   ? [{ heading: String(b.productsHeading), products, columns: products.length > 4 ? 3 : 2 }]
   : undefined,
  footerNote: brand?.footerText?.trim() ? brand.footerText.trim().replace(/\{store\}/g, fromName) : `You're receiving this because you shopped with ${fromName}.`,
  unsubscribeUrl: "https://example.com/unsubscribe",
  brand: brand ? {
   accent: brand.accent, text: brand.text, bg: brand.bg,
   headingFont: brand.headingFont, bodyFont: brand.bodyFont, buttonLabel: brand.buttonLabel,
   buttonStyle: brand.buttonStyle, headerAlign: brand.headerAlign, showAccentBar: brand.showAccentBar,
  } : null,
 });

 return NextResponse.json({ ok: true, html, storeName: fromName });
}
