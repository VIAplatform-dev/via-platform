import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { resolveStoreSender } from "@/app/lib/email-settings-db";
import { TEMPLATES, CATEGORIES, fillTemplate } from "@/app/lib/email-templates";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listStorefrontItems } from "@/app/lib/db/inventory";
import { storeEmailHtml } from "@/app/lib/email-template";
import { getStoreEmailBrand } from "@/app/lib/email";

export const dynamic = "force-dynamic";

// GET — the starting points, already filled in with this shop's own details.
//
// Filled HERE rather than in the browser because the tokens need the store's newest piece and how
// many it has, and a picker that shows "{count} new pieces just landed" is asking the seller to
// finish writing it. Every card is the email she'd actually send.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const [{ fromName }, seller] = await Promise.all([
  resolveStoreSender(slug),
  getSellerBySlug(slug).catch(() => null),
 ]);
 // The newest pieces, for {piece} and {count}. Failure here costs a token, not the page.
 const items = seller ? await listStorefrontItems(seller.id).catch(() => []) : [];
 const newest = items.slice(0, 12);
 const fill = { store: fromName, piece: newest[0]?.title ?? null, count: newest.length || null };
 const brand = await getStoreEmailBrand(slug).catch(() => null);
 const money = (c: number | null | undefined) => (c == null ? null : `$${Math.round(c / 100).toLocaleString()}`);
 const asProducts = (n: number) => newest.slice(0, n).map((i) => ({
  title: i.title, image: (i.images as string[] | null)?.[0] ?? null,
  priceLabel: money(i.priceCents), url: "#",
 }));

 return NextResponse.json({
  ok: true,
  categories: CATEGORIES,
  templates: TEMPLATES.map((t) => ({
   id: t.id, name: t.name, category: t.category, blurb: t.blurb, cta: t.cta ?? null,
   subject: fillTemplate(t.subject, fill),
   body: fillTemplate(t.body, fill),
   design: t.design,
   // The card shows the REAL email, rendered. A sketch of a template is a guess at what you'd get;
   // this is what would arrive, in the shop's own colours, with the shop's own pieces in it.
   preview: storeEmailHtml({
    storeName: fromName,
    logo: brand?.logo ?? null,
    design: t.design,
    headline: fillTemplate(t.body, fill).split("\n")[0] || fillTemplate(t.subject, fill),
    subhead: fillTemplate(t.body, fill).split("\n").slice(1).join(" ") || null,
    button: t.cta ? { label: t.cta, url: "https://example.com" } : null,
    products: t.pieces === "new" ? asProducts(t.design === "grid" ? 4 : 2) : [],
    brand: brand ? {
     accent: brand.accent, text: brand.text, bg: brand.bg,
     headingFont: brand.headingFont, bodyFont: brand.bodyFont,
     buttonStyle: brand.buttonStyle, headerAlign: brand.headerAlign, showAccentBar: brand.showAccentBar,
    } : null,
   }),
  })),
 });
}
