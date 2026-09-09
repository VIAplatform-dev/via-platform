import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { resolveStoreSender } from "@/app/lib/email-settings-db";
import { campaignEmailHtml, getStoreEmailBrand, sanitizeBrand } from "@/app/lib/email";
import { storeEmailHtml } from "@/app/lib/email-template";

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
 const use = brand ?? (await getStoreEmailBrand(slug));

 // Two shapes, because the store sends two kinds of email and they don't look the same. A CAMPAIGN
 // is written and designed by the store. An AUTOMATIC email — new arrivals, an abandoned basket, a
 // welcome — goes out unseen, so they all share one simple format. Previewing only the first meant
 // a store had no way to see what its automatic emails actually looked like.
 if (b?.kind === "automated") {
  const html = storeEmailHtml({
   storeName: fromName,
   logo: use.logo ?? null,
   // Deliberately plain. This is a preview of the SHAPE, and copy that sounds like a real campaign
   // reads as wording the store is stuck with — the words come from each automation, not from here.
   eyebrow: "New in",
   headline: "Four new pieces just landed.",
   subhead: null,
   button: link ? { label: use.buttonLabel || "Shop new arrivals", url: link } : null,
   productsHeading: "Just in",
   // Stand-ins, clearly not real stock: the point is the shape, and a preview that fetched live
   // inventory would look different every time a store published something.
   products: [
    // No image on the samples: a placeholder service renders a WORD across the picture, and in the
    // preview "Piece" in 40px type was the loudest thing on the page. The empty grey block is what a
    // real piece without a photo shows anyway, so this previews an honest worst case.
    { title: "1990s silk slip dress", image: null, priceLabel: "$200", url: link || "https://example.com" },
    { title: "Tweed flap bag", image: null, priceLabel: "$4,000", url: link || "https://example.com" },
   ],
   footerNote: use.footerText?.trim()
    ? use.footerText.trim().replace(/\{store\}/g, fromName)
    : `You're receiving this because you shopped with ${fromName}.`,
   unsubscribeUrl: "https://example.com/unsubscribe",
   brand: { accent: use.accent, text: use.text, bg: use.bg, headingFont: use.headingFont, bodyFont: use.bodyFont, buttonLabel: use.buttonLabel, buttonStyle: use.buttonStyle, headerAlign: use.headerAlign, showAccentBar: use.showAccentBar },
  });
  return NextResponse.json({ ok: true, html, storeName: fromName });
 }

 const html = campaignEmailHtml({ storeName: fromName, body: String(b?.body || "").slice(0, 10000), link, brand: use });
 return NextResponse.json({ ok: true, html, storeName: fromName });
}
