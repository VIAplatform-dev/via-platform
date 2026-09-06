/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStorefrontByHandleAny } from "@/app/lib/storefront-db";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getItem } from "@/app/lib/db/inventory";
import { getInboxSettings } from "@/app/lib/storefront-settings-db";
import { getRefundPolicy, policySummary } from "@/app/lib/store-policy-db";
import { formatPrice } from "@/app/lib/formatPrice";
import AskAboutItem from "@/app/s/AskAboutItem";
import MakeOffer from "@/app/components/MakeOffer";
import StorefrontTracker from "@/app/s/StorefrontTracker";
import NewsletterForm from "@/app/s/NewsletterForm";
import { StoreHeader, StoreFooter, type ChromeNav } from "@/app/s/StoreChrome";
import { listCollections } from "@/app/lib/db/collections";
import { sanitizePages } from "@/app/lib/storefront-blocks";
import { SERIF_FONTS } from "@/app/lib/storefront-templates";
import RentBox from "@/app/s/RentBox";
import ProductSlideshow from "@/app/s/ProductSlideshow";
import SiteEffects from "@/app/s/SiteEffects";
import { resolveEffects, hasEffects } from "@/app/lib/storefront-effects";
import { rentalContext } from "@/app/lib/rentals/rentals-db";
import { storefrontCss } from "@/app/lib/storefront-chrome-css";
import { storePublicOrigin, isStoreHost } from "@/app/lib/plan-b/store-host";
import { storefrontScript } from "@/app/lib/storefront-code";
import { headers } from "next/headers";
import { resolveProductPage, visibleFields, buttonCss, type ProductSlot } from "@/app/lib/storefront-product-page";

export const dynamic = "force-dynamic";

// The canonical serif list lives with the fonts themselves — this page kept its own copy, which went
// stale the moment a template picked Spectral or Zilla Slab and got a sans fallback here only.
const ff = (n?: string) => (n ? `'${n}', ${SERIF_FONTS.has(n) ? "Georgia, serif" : "system-ui, sans-serif"}` : undefined);

// Storefronts are served on the stable public host; product URLs there are the canonical ones.
const STOREFRONT_BASE = "https://vyaplatform.com";

// Collapse whitespace + cap length for meta tags (Google shows ~155–160 chars of description).
function clean(s: string, max = 160): string {
 const t = (s || "").replace(/\s+/g, " ").trim();
 return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
// Map a resale condition note/grade to a schema.org itemCondition (drives the rich result).
function conditionUrl(cond?: string | null): string {
 const g = (cond || "").toLowerCase();
 return /deadstock|nwt|new with tag|brand new|unworn/.test(g) ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition";
}

type Props = { params: Promise<{ handle: string; id: string }>; searchParams: Promise<{ preview?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
 const { handle, id } = await params;
 const { preview } = await searchParams;
 const sf = await getStorefrontByHandleAny(handle).catch(() => null);
 if (!sf) return { title: "Product" };
 const seller = await getSellerBySlug(sf.storeSlug).catch(() => null);
 const item = await getItem(id).catch(() => null);
 if (!item || !seller || item.sellerId !== seller.id || item.status === "removed") {
  return { title: "Product", robots: { index: false, follow: false } };
 }
 const storeName = sf.theme?.storeName || seller.name || handle.replace(/-/g, " ");
 const price = formatPrice(item.priceCents / 100, item.currency);
 // Prefer the store's own words (organic, unique). Fall back to a keyword-rich but natural
 // sentence built from the real attributes — never stuffed, just descriptive.
 const desc = item.description
  ? clean(item.description)
  : clean(`${[item.brand, item.era, item.title].filter(Boolean).join(" ")}${item.size ? `, size ${item.size}` : ""}${item.condition ? ` — ${item.condition}` : ""}. ${price} at ${storeName}. One-of-one vintage, secure checkout.`);
 const title = `${item.title} | ${storeName}`;
 const url = `${STOREFRONT_BASE}/s/${handle}/p/${id}`;
 const image = (item.images || []).filter(Boolean)[0];
 const hasDomain = !!sf.customDomain;
 // Index live product pages so they rank — but only the store's REAL address. Once a store has one
 // of its own (a connected domain, or its {slug}.vyasites.com origin), this /s/ copy is a mirror and
 // is left out of the index so Google doesn't choose between two of the same page.
 const ownOrigin = storePublicOrigin(sf.storeSlug);
 const index = sf.enabled && !preview && !hasDomain && !ownOrigin;
 return {
  title,
  description: desc,
  // Same rule as the storefront home page: the store's own address is canonical, this is the mirror.
  alternates: { canonical: hasDomain ? `https://${sf.customDomain}` : (ownOrigin ? `${ownOrigin}/p/${id}` : url) },
  robots: { index, follow: true },
  openGraph: { title, description: desc, type: "website", url, siteName: storeName, ...(image ? { images: [{ url: image }] } : {}) },
  twitter: { card: image ? "summary_large_image" : "summary", title, description: desc, ...(image ? { images: [image] } : {}) },
 };
}

export default async function ProductPage({ params, searchParams }: Props) {
 const { handle, id } = await params;
 const { preview } = await searchParams;
 const sf = await getStorefrontByHandleAny(handle).catch(() => null);
 if (!sf) return notFound();
 const seller = await getSellerBySlug(sf.storeSlug).catch(() => null);
 const item = await getItem(id).catch(() => null);
 if (!item || !seller || item.sellerId !== seller.id || item.status === "removed") return notFound();

 const c = { bg: sf.theme?.colors?.bg || "#FFFDF8", text: sf.theme?.colors?.text || "#1a1a1a", accent: sf.theme?.colors?.accent || "#5D0F17" };
 const heading = ff(sf.theme?.fonts?.heading || "Playfair Display");
 const body = ff(sf.theme?.fonts?.body || "Inter");
 const fams = [sf.theme?.fonts?.heading, sf.theme?.fonts?.body].filter(Boolean).map((f) => `family=${(f as string).replace(/ /g, "+")}:wght@400;500;600;700`).join("&");
 const storeName = sf.theme?.storeName || seller.name || handle.replace(/-/g, " ");
 const images = (item.images || []).filter(Boolean);
 const sold = item.status === "sold" || item.status === "reserved";
 const price = formatPrice(item.priceCents / 100, item.currency);
 // Same rule as the storefront: on the store's own origin its pages are the root, so links must
 // not carry VYA's internal /s/{handle} prefix.
 const base = isStoreHost((await headers()).get("host")) ? "" : `/s/${handle}`;
 const link = (p: string) => (preview ? `${p || "/"}?preview=1` : p || "/");
 // Resolved on the server because rentals decide whether Buy is offered at all: a piece the store
 // rents but doesn't sell must not show a Buy button.
 const rental = await rentalContext(item.id, sf.storeSlug).catch(() => null);
 const rentable = Boolean(rental?.settings.enabled && rental?.terms?.tiers?.length);
 const buyable = !rentable || rental?.terms?.alsoForSale !== false;
 // Honor the store's Buyer-messaging toggle (defaults on if settings are unavailable).
 const inbox = await getInboxSettings(sf.storeSlug).catch(() => null);
 // The store's return/refund policy — shown so a buyer knows before they buy.
 const policy = await getRefundPolicy(sf.storeSlug).catch(() => null);

 // ── Store chrome ──
 // This page used to render its own two-link nav and a "Powered by VYA" line, so a shopper who
 // clicked a product left the store's design behind — no logo, no collections, none of the pages the
 // template ships with, no footer. It now renders the SAME header and footer as every other page.
 const theme = sf.theme ?? {};
 const collections = await listCollections(seller.id).catch(() => []);
 const extraPages = sanitizePages(theme.extraPages ?? []);
 const nav: ChromeNav[] = [
  { label: "Home", href: link(`${base}`) },
  { label: "Shop", href: link(`${base}/shop`) },
  ...collections.filter((col) => col.itemCount > 0).map((col) => ({ label: col.title, href: link(`${base}/collections/${col.slug}`) })),
  ...extraPages.map((pg) => ({ label: pg.title, href: link(`${base}/${pg.slug}`) })),
 ];
 const customLinks = (theme.navLinks ?? []).filter((l) => l.label && l.href);
 const hrefOf = (h: string) => (h.startsWith("/") ? link(h) : h);
 const headerNav = [...nav, ...customLinks.filter((l) => l.place !== "footer").map((l) => ({ label: l.label, href: hrefOf(l.href) }))];
 const footerNav = [...nav, ...customLinks.filter((l) => l.place !== "header").map((l) => ({ label: l.label, href: hrefOf(l.href) }))];

 // How this template presents a single piece. Absent = "classic", which is what this page has always
 // rendered, so a store saved before templates carried the field is unchanged.
 const productLayout = theme.productLayout ?? "classic";

 // What this page SAYS: which facts are printed, in what order, inline or folded away, and the two
 // sentences that used to be hardcoded into every store's page regardless of its voice.
 const pageCopy = resolveProductPage(theme.productPage);
 const siteEffects = resolveEffects(theme.effects);
 const storeCode = storefrontScript(theme.customJs, base === "");
 const facts = visibleFields(pageCopy, item);
 // A was-price, struck through. Stored on every listing and never shown until a store asks for it.
 const compareAt = pageCopy.comparePrice && item.compareAtCents && item.compareAtCents > item.priceCents
  ? formatPrice(item.compareAtCents / 100, item.currency)
  : null;

 // Product structured data (schema.org) → Google rich results: price, availability, condition,
 // brand shown right in search. Only emitted for a live storefront (not a preview render).
 const url = `${STOREFRONT_BASE}/s/${handle}/p/${id}`;
 const productLd = {
 "@context": "https://schema.org",
 "@type": "Product",
 name: item.title,
 ...(images.length ? { image: images } : {}),
 ...(item.description ? { description: clean(item.description, 5000) } : {}),
 ...(item.brand ? { brand: { "@type": "Brand", name: item.brand } } : {}),
 ...(item.category ? { category: item.category } : {}),
 ...(item.material ? { material: item.material } : {}),
 ...(item.size ? { size: item.size } : {}),
 offers: {
 "@type": "Offer",
 price: (item.priceCents / 100).toFixed(2),
 priceCurrency: item.currency || "USD",
 availability: sold ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
 itemCondition: conditionUrl(item.condition),
 url,
 seller: { "@type": "Organization", name: storeName },
 },
 };

 // ── The three arrangements ──
 // The gallery and the details are built once and PLACED differently, so a layout change can never
 // alter what a product page contains — only where the parts sit and how the images are sized.
 // Plain functions rather than components: nothing here holds state, and inline components would be
 // re-created on every render.
 const gallery = (stacked?: boolean) =>
 images.length === 0 ? (
  <div className="vya-round aspect-[4/5] w-full bg-black/5" />
 ) : stacked ? (
  // Every photograph at full width, one after another. The image IS the argument.
  <div className="space-y-4 sm:space-y-6">
   {images.map((src, i) => (
    <img key={i} src={src} alt={i === 0 ? item.title : ""} loading={i === 0 ? "eager" : "lazy"} className="vya-round w-full bg-black/5 object-cover" />
   ))}
  </div>
 ) : (
  <div className="space-y-3">
   <div className="vya-round overflow-hidden bg-black/5">
    <img src={images[0]} alt={item.title} className="w-full object-cover" />
   </div>
   {images.length > 1 && (
    <div className="grid grid-cols-4 gap-3">
     {images.slice(1, 5).map((src, i) => (
      <div key={i} className="vya-round aspect-square overflow-hidden bg-black/5"><img src={src} alt="" loading="lazy" className="h-full w-full object-cover" /></div>
     ))}
    </div>
   )}
  </div>
 );

 // One fact. `description` is the piece's own writing so it prints without a heading when it's
 // inline — a paragraph labelled "Description" is a form, not a listing. Everything else is
 // labelled, because "Italy" on its own says nothing.
 const fact = (f: { key: string; label: string; value: string; mode: string }) =>
  f.mode === "drawer" ? (
   <details key={f.key} className="vya-details mt-4 border-t border-current/10 pt-4">
    <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] uppercase tracking-[0.2em] opacity-60 hover:opacity-90">
     {f.label}<span className="vya-details-mark ml-3 text-[13px] opacity-60">+</span>
    </summary>
    <p className="mt-2.5 whitespace-pre-wrap text-sm leading-[1.7] opacity-75">{f.value}</p>
   </details>
  ) : f.mode === "chip" ? (
   // A pill, the way most fashion sites show a size. Always fully round — that IS the shape being
   // asked for, so it doesn't follow the store's corner setting the way a card or button does.
   <div key={f.key} className="mt-5">
    <p className="text-[11px] uppercase tracking-[0.2em] opacity-50">{f.label}</p>
    <span className="mt-2 inline-flex items-center rounded-full px-4 py-1.5 text-[13px]" style={{ background: c.accent, color: "#fff" }}>{f.value}</span>
   </div>
  ) : f.key === "description" ? (
   <p key={f.key} className="mt-7 whitespace-pre-wrap text-sm leading-[1.9] opacity-75">{f.value}</p>
  ) : (
   <div key={f.key} className="mt-6 border-t border-current/10 pt-4">
    <p className="text-[11px] uppercase tracking-[0.2em] opacity-50">{f.label}</p>
    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-[1.7] opacity-75">{f.value}</p>
   </div>
  );

 // Every photograph at once, two up. Where `rail` gives one wide column and `classic` gives a hero
 // with thumbnails, this treats the roll as a contact sheet — no photo is the important one.
 const galleryGrid = () =>
 images.length === 0 ? (
  <div className="vya-round aspect-[4/5] w-full bg-black/5" />
 ) : (
  <div className="grid grid-cols-2 gap-3 sm:gap-4">
   {images.map((src, i) => (
    <div key={i} className={`vya-round overflow-hidden bg-black/5 ${images.length % 2 === 1 && i === 0 ? "col-span-2" : ""}`}>
     <img src={src} alt={i === 0 ? item.title : ""} loading={i === 0 ? "eager" : "lazy"} className="w-full object-cover" />
    </div>
   ))}
  </div>
 );

 // ── The details column, in the seller's order ───────────────────────────────────────────────────
 // Each part is built once and PLACED by the slot list, so reordering can never change what a
 // product page contains — only the order it says it in. The back link is pinned above the list
 // (it's navigation, not content) and the returns policy below it (it's the shop's, not the piece's).
 const slotTitle = (
  <h1 className="text-3xl leading-[1.1] sm:text-[2.5rem]" style={{ fontFamily: heading }}>{item.title}</h1>
 );

 // A rentable piece leads with its RENTAL price, which the rent box shows. Printing the sale price
 // above it reads as the rental cost — and on a rent-only piece it's often $0.
 const slotPrice = (!rentable || sold) ? (
  <p className="flex flex-wrap items-baseline gap-2.5 text-xl" style={{ color: sold ? "inherit" : c.accent, opacity: sold ? 0.5 : 1 }}>
   {compareAt && <span className="text-base line-through opacity-45">{compareAt}</span>}
   <span>{price}{sold ? " · Sold" : ""}</span>
   {compareAt && !sold && <span className="rounded-full border border-current/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]">Sale</span>}
  </p>
 ) : null;

 const slotDetails = facts.length ? <div>{facts.map(fact)}</div> : null;

 const slotBuy = (centered?: boolean) => (
  <div className={centered ? "mx-auto max-w-sm" : "max-w-sm"}>
   {sold ? (
    <p className="vya-cta border border-current/20 py-4 text-center text-[11px] uppercase tracking-[0.2em] opacity-45">Sold</p>
   ) : (
    <>
     {rentable && <RentBox itemId={item.id} accent={c.accent} alsoForSale={buyable} />}
     {buyable && (
      <a
       href={`/checkout?item=${item.id}`}
       className={rentable
        ? "vya-cta mt-3 block w-full border border-current/25 py-4 text-center text-[11px] uppercase tracking-[0.2em] transition hover:opacity-70"
        : "vya-cta block w-full py-4 text-center text-[11px] uppercase tracking-[0.2em] text-white transition hover:opacity-90"}
       style={rentable ? undefined : { background: c.accent }}
      >Buy {rentable ? "outright" : "now"} — {price}</a>
     )}
    </>
   )}
   {!sold && (
    <div className="mt-3 flex flex-col gap-1">
     {inbox?.messagingEnabled !== false && <AskAboutItem storeSlug={sf.storeSlug} itemTitle={item.title} accent={c.accent} />}
     <MakeOffer storeSlug={sf.storeSlug} itemId={item.id} itemTitle={item.title} listPriceCents={item.priceCents} accent={c.accent} />
    </div>
   )}
  </div>
 );

 const slotBody = (slot: ProductSlot, centered?: boolean) => {
  switch (slot.kind) {
   case "title": return slotTitle;
   case "price": return slotPrice;
   case "details": return slotDetails;
   case "buy": return slotBuy(centered);
   case "assurance": return pageCopy.assurance ? <p className="text-[11px] leading-relaxed opacity-55">{pageCopy.assurance}</p> : null;
   case "text": return <p className="text-[12.5px] leading-relaxed opacity-70">{slot.text}</p>;
   case "link": return (
    <a href={slot.href} className="text-[12px] underline underline-offset-4 opacity-70 transition hover:opacity-100">{slot.text}</a>
   );
   case "divider": return <hr className="border-0 border-t border-current/15" />;
   default: return null;
  }
 };

 const details = (centered?: boolean) => (
 <div className={centered ? "mx-auto max-w-xl text-center" : undefined}>
  {pageCopy.backLabel && (
   <a href={link(`${base}/shop`)} className="mb-5 inline-block text-[10px] uppercase tracking-[0.25em] opacity-40 hover:opacity-70">{pageCopy.backLabel}</a>
  )}
  {/* Gap, not per-part margins: a reorderable list can't carry "space above" on each piece without
      the spacing changing every time two of them swap. */}
  <div className="flex flex-col gap-5">
   {pageCopy.slots.filter((sl) => sl.show).map((sl) => {
    const body = slotBody(sl, centered);
    return body ? <div key={sl.id}>{body}</div> : null;
   })}
  </div>
  {policy && <p className="mt-3 text-[11px] leading-relaxed opacity-60" title={policy.policyText || undefined}>{policySummary(policy)}</p>}
 </div>
 );


 return (
 <main style={{ background: c.bg, color: c.text, fontFamily: body }} className="vya-pp min-h-screen">
 {sf.enabled && !preview && (
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }} />
 )}
 {sf.enabled && !preview && <StorefrontTracker slug={sf.storeSlug} pageType="product" itemId={String(item.id)} priceCents={item.priceCents} />}
 {fams && <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?${fams}&display=swap`} />}

 {/* The store's corner style and skin. This page renders its own markup rather than blocks, so it
     never got the stylesheet the block canvas emits — meaning `vya-round` / `vya-cta` / `vya-field`
     were sitting on the rent box, the gallery frames and the ask/offer buttons doing nothing, and a
     store set to round corners had square ones on every product it sells. */}
 <style dangerouslySetInnerHTML={{ __html: storefrontCss(theme.radius, theme.skin) + buttonCss(pageCopy.buttons, c.accent) }} />

 {/* The same pointer effect the rest of the site wears — an effect that stopped at the product
     page would be the one page where it's most obviously missing. */}
 {hasEffects(siteEffects) && <SiteEffects effects={siteEffects} accent={c.accent} />}
 {storeCode && <script dangerouslySetInnerHTML={{ __html: storeCode }} />}

 <StoreHeader
  storeName={storeName}
  logo={theme.logo || undefined}
  nav={headerNav}
  colors={c}
  headingFontFamily={heading}
  layout={theme.headerLayout || "inline"}
 />

 {productLayout === "rail" ? (
 // Images run down a wide column; the details stay beside you as you scroll. For stores where the
 // era, the measurements and the authentication note ARE the sale.
 <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 sm:px-8 sm:py-16 md:grid-cols-[1.45fr_1fr] md:gap-16">
  {gallery(true)}
  <div className="md:sticky md:top-24 md:self-start">{details()}</div>
 </div>
 ) : productLayout === "stacked" ? (
 // Full-width photographs, then the copy in a narrow measure beneath. Minimal chrome by design.
 <div className="pb-4">
  <div className="mx-auto max-w-5xl px-0 pt-6 sm:px-8 sm:pt-10">{gallery(true)}</div>
  <div className="mx-auto max-w-3xl px-6 py-14 sm:px-8">{details(true)}</div>
 </div>
 ) : productLayout === "mirror" ? (
 // Classic, reversed: the writing leads. A shop whose pieces need explaining — provenance, a
 // designer nobody knows yet — sells on the paragraph, and this puts it where reading starts.
 // The photographs come FIRST in the DOM order on a phone, where there is no left and right and a
 // wall of text above the picture is nobody's product page.
 <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 sm:gap-16 sm:px-8 sm:py-16 md:grid-cols-2">
  <div className="md:order-2">{gallery()}</div>
  <div className="md:order-1 md:pt-4">{details()}</div>
 </div>
 ) : productLayout === "gallery" ? (
 // A contact sheet. Every shot at equal weight, the details held beside them.
 <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 sm:px-8 sm:py-16 md:grid-cols-[1.6fr_1fr] md:gap-14">
  {galleryGrid()}
  <div className="md:sticky md:top-24 md:self-start">{details()}</div>
 </div>
 ) : productLayout === "slideshow" ? (
 // One photograph at a time. The detail shot of a seam or a label is a thing you look at, not
 // something to scroll past — and eight angles in a grid reads as clutter.
 <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 sm:gap-16 sm:px-8 sm:py-16 md:grid-cols-2">
  <ProductSlideshow images={images} title={item.title} />
  <div className="md:pt-4">{details()}</div>
 </div>

 ) : (
 <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 sm:gap-16 sm:px-8 sm:py-16 md:grid-cols-2">
  {gallery()}
  <div className="md:pt-4">{details()}</div>
 </div>
 )}

 <StoreFooter
  storeName={storeName}
  logo={theme.logo || undefined}
  nav={footerNav}
  colors={c}
  headingFontFamily={heading}
  year={new Date().getFullYear()}
  tagline={sf.tagline || undefined}
  footerAbout={theme.footerAbout || undefined}
  socials={theme.socials}
  newsletter={<NewsletterForm accent={c.accent} />}
 />
 </main>
 );
}
