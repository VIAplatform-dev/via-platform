// One campaign email, built once — for the preview, for the test send, for the real send, and for
// the cron that sends a scheduled one.
//
// It used to be two different builders. The composer's preview called storeEmailHtml with the
// design, the eyebrow, the chosen pieces, the discount code, the link row and the background; the
// SEND called campaignEmailHtml with a headline and a link and nothing else. So a seller laid out an
// email with four photos, a button and a code, sent a test to herself, and got a plain paragraph —
// "test didnt look like this page". The composer's own comment claimed the two paths shared a
// function, which is the kind of comment that stops anyone checking.
//
// So: this module resolves everything the email needs (sender, brand, pieces, links) ONCE and hands
// back a function that stamps in a per-recipient unsubscribe URL. Every path goes through it.

import { resolveStoreSender } from "./email-settings-db";
import { getStoreEmailBrand } from "./email";
import { storeEmailHtml } from "./email-template";
import { bandsPieces, type CampaignDesign } from "./campaign-design-core";
import { getSellerBySlug } from "./db/sellers";
import { listStorefrontItems } from "./db/inventory";

/**
 * Resolve a campaign into a renderer: the expensive lookups happen once, and the returned function
 * only stamps in the unsubscribe URL, which is the one thing that differs per recipient.
 */
export async function campaignRenderer(
 storeSlug: string,
 d: CampaignDesign,
 opts: { fallbackLink?: string } = {},
): Promise<{ render: (unsubscribeUrl: string) => string; storeName: string; fromAddress: string }> {
 const [{ fromName, website, fromAddress }, brand, seller] = await Promise.all([
  resolveStoreSender(storeSlug),
  getStoreEmailBrand(storeSlug).catch(() => null),
  getSellerBySlug(storeSlug).catch(() => null),
 ]);

 const link = d.link || opts.fallbackLink || website || "https://example.com";

 // Chosen pieces beat "the newest N" the moment a shop wants to feature something; the count is the
 // fallback for a seller who doesn't want to pick.
 let products: { title: string; image: string | null; priceLabel: string | null; url: string }[] = [];
 if ((d.pieceCount || d.itemIds.length) && seller) {
  const items = await listStorefrontItems(seller.id).catch(() => []);
  const picked = d.itemIds.length
   ? d.itemIds.map((id) => items.find((i) => i.id === id)).filter(Boolean)
   : items.slice(0, d.pieceCount);
  products = (picked as typeof items).map((i) => ({
   title: i.title,
   image: (i.images as string[] | null)?.[0] ?? null,
   priceLabel: i.priceCents == null ? null : `$${Math.round(i.priceCents / 100).toLocaleString()}`,
   url: link,
  }));
 }

 const band = bandsPieces(d.design, d.productsHeading, products.length);

 const render = (unsubscribeUrl: string) => storeEmailHtml({
  storeName: fromName,
  logo: brand?.logo ?? null,
  design: d.design,
  ground: d.ground,
  showPrices: d.showPrices,
  eyebrow: d.eyebrow,
  preheader: d.preheader,
  code: d.code,
  linksHeading: null,
  links: d.links,
  headline: d.headline,
  subhead: d.subhead,
  button: d.ctaLabel ? { label: d.ctaLabel, url: link } : null,
  // Band or inline — see bandsPieces in campaign-design-core.ts.
  products: band ? [] : products,
  productsHeading: d.productsHeading,
  sections: band
   ? [{ heading: d.productsHeading!, products, columns: products.length > 4 ? 3 : 2 }]
   : undefined,
  footerNote: brand?.footerText?.trim()
   ? brand.footerText.trim().replace(/\{store\}/g, fromName)
   : `You're receiving this because you shopped with ${fromName}.`,
  unsubscribeUrl,
  brand: brand ? {
   accent: brand.accent, text: brand.text, bg: brand.bg,
   headingFont: brand.headingFont, bodyFont: brand.bodyFont, buttonLabel: brand.buttonLabel,
   buttonStyle: brand.buttonStyle, headerAlign: brand.headerAlign, showAccentBar: brand.showAccentBar,
  } : null,
 });

 // The address a shopper will see it come from. Falls back to the shared domain, which is what
 // sendStoreCampaign does when a store has no verified sender of its own.
 return { render, storeName: fromName, fromAddress: fromAddress || "campaigns@vyaplatform.com" };
}

export { parseCampaignDesign, type CampaignDesign } from "./campaign-design-core";
