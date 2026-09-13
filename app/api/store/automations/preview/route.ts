import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { resolveStoreSender } from "@/app/lib/email-settings-db";
import { getStoreEmailBrand, automationEmailHtml, newArrivalsEmailHtml } from "@/app/lib/email";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listStorefrontItems } from "@/app/lib/db/inventory";

export const dynamic = "force-dynamic";

// POST { key } — render a built-in automation so a seller can read it before switching it on.
//
// Rendered by the SAME builders the sends use (automationEmailHtml / newArrivalsEmailHtml), with
// the store's real brand and a real piece from its inventory. A flow a seller cannot read before
// turning on is one she turns on and hopes about — and a preview drawn by different code than the
// send is worse than none, which the campaign composer proved at length.
//
// The wording here mirrors automation-engine.ts. Where it drifts, this is the copy to correct.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => ({}));
 const key = String(body?.key || "");

 const [{ fromName, website }, brand, seller] = await Promise.all([
  resolveStoreSender(slug),
  getStoreEmailBrand(slug).catch(() => undefined),
  getSellerBySlug(slug).catch(() => null),
 ]);

 // A real piece, so she is reading her own shop rather than a lorem-ipsum one. Falls back to a
 // stand-in for a store with nothing published yet — the layout is still what she needs to see.
 const items = seller ? await listStorefrontItems(seller.id).catch(() => []) : [];
 const first = items[0];
 const piece = first
  ? { title: first.title, image: (first.images as string[] | null)?.[0] ?? null, priceCents: first.priceCents ?? 0, currency: "USD", url: website || "https://example.com" }
  : { title: "A piece from your shop", image: null, priceCents: 12000, currency: "USD", url: website || "https://example.com" };

 const shared = { storeName: fromName, brand, unsubscribeUrl: "https://example.com/unsubscribe" };

 if (key === "abandoned_cart") {
  // Mirrors automation-engine.ts: the piece's title carries the subject, the first line of the
  // body becomes the headline.
  return NextResponse.json({
   ok: true,
   subject: `${piece.title} is still in your basket`,
   html: automationEmailHtml({
    ...shared,
    subject: `${piece.title} is still in your basket`,
    body: `You left ${piece.title} in your basket.\nIt's still here if you'd like it.`,
    link: website || "https://example.com",
    products: [piece],
   }),
  });
 }

 if (key === "new_arrivals") {
  const products = (items.length ? items.slice(0, 3) : [first]).filter(Boolean).map((i) => ({
   title: i!.title,
   image: (i!.images as string[] | null)?.[0] ?? null,
   priceCents: i!.priceCents ?? 0,
   currency: "USD",
   url: website || "https://example.com",
  }));
  const count = products.length || 1;
  const subject = `New arrivals from ${fromName}`;
  return NextResponse.json({
   ok: true,
   subject,
   // This flow drafts rather than sends, so the preview is of the draft she would be handed.
   note: "This one writes a draft and leaves it on Your emails — you check it and send.",
   html: newArrivalsEmailHtml({
    storeName: fromName,
    intro: `${count} new ${count === 1 ? "piece" : "pieces"} just landed.`,
    products: products.length ? products : [{ ...piece }],
    shopUrl: website || "https://example.com",
    brand,
    unsubscribeUrl: "https://example.com/unsubscribe",
   }),
  });
 }

 return NextResponse.json({ error: "There's no preview for that one yet." }, { status: 400 });
}
