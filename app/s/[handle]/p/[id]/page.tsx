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
 // Index live product pages so they rank; skip previews + the mirror of a custom-domain store.
 const index = sf.enabled && !preview && !hasDomain;
 return {
  title,
  description: desc,
  alternates: { canonical: hasDomain ? `https://${sf.customDomain}` : url },
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
 const link = (p: string) => (preview ? `${p}?preview=1` : p);
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
  { label: "Home", href: link(`/s/${handle}`) },
  { label: "Shop", href: link(`/s/${handle}/shop`) },
  ...collections.filter((col) => col.itemCount > 0).map((col) => ({ label: col.title, href: link(`/s/${handle}/collections/${col.slug}`) })),
  ...extraPages.map((pg) => ({ label: pg.title, href: link(`/s/${handle}/${pg.slug}`) })),
 ];
 const customLinks = (theme.navLinks ?? []).filter((l) => l.label && l.href);
 const hrefOf = (h: string) => (h.startsWith("/") ? link(h) : h);
 const headerNav = [...nav, ...customLinks.filter((l) => l.place !== "footer").map((l) => ({ label: l.label, href: hrefOf(l.href) }))];
 const footerNav = [...nav, ...customLinks.filter((l) => l.place !== "header").map((l) => ({ label: l.label, href: hrefOf(l.href) }))];

 // How this template presents a single piece. Absent = "classic", which is what this page has always
 // rendered, so a store saved before templates carried the field is unchanged.
 const productLayout = theme.productLayout ?? "classic";

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
  <div className="aspect-[4/5] w-full bg-black/5" />
 ) : stacked ? (
  // Every photograph at full width, one after another. The image IS the argument.
  <div className="space-y-4 sm:space-y-6">
   {images.map((src, i) => (
    <img key={i} src={src} alt={i === 0 ? item.title : ""} loading={i === 0 ? "eager" : "lazy"} className="w-full bg-black/5 object-cover" />
   ))}
  </div>
 ) : (
  <div className="space-y-3">
   <div className="overflow-hidden bg-black/5">
    <img src={images[0]} alt={item.title} className="w-full object-cover" />
   </div>
   {images.length > 1 && (
    <div className="grid grid-cols-4 gap-3">
     {images.slice(1, 5).map((src, i) => (
      <div key={i} className="aspect-square overflow-hidden bg-black/5"><img src={src} alt="" loading="lazy" className="h-full w-full object-cover" /></div>
     ))}
    </div>
   )}
  </div>
 );

 const details = (centered?: boolean) => (
 <div className={centered ? "mx-auto max-w-xl text-center" : undefined}>
  <a href={link(`/s/${handle}/shop`)} className="text-[10px] uppercase tracking-[0.25em] opacity-40 hover:opacity-70">← Back to shop</a>
  <h1 className="mt-5 text-3xl leading-[1.1] sm:text-[2.5rem]" style={{ fontFamily: heading }}>{item.title}</h1>
  <p className="mt-4 text-xl" style={{ color: sold ? "inherit" : c.accent, opacity: sold ? 0.5 : 1 }}>{price}{sold ? " · Sold" : ""}</p>
  {item.size && <p className="mt-4 text-[13px] uppercase tracking-[0.18em] opacity-60">Size {item.size}</p>}
  {item.description && <p className="mt-7 whitespace-pre-wrap text-sm leading-[1.9] opacity-75">{item.description}</p>}
  {item.measurements && (
   <div className="mt-6 border-t border-current/10 pt-4">
    <p className="text-[11px] uppercase tracking-[0.2em] opacity-50">Measurements</p>
    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-[1.7] opacity-75">{item.measurements}</p>
   </div>
  )}
  <div className={centered ? "mx-auto mt-9 max-w-sm" : "mt-9 max-w-sm"}>
   {sold ? (
    <p className="border border-current/20 py-4 text-center text-[11px] uppercase tracking-[0.2em] opacity-45">Sold</p>
   ) : (
    <a href={`/checkout?item=${item.id}`} className="block w-full py-4 text-center text-[11px] uppercase tracking-[0.2em] text-white transition hover:opacity-90" style={{ background: c.accent }}>Buy now — {price}</a>
   )}
   {!sold && (
    <div className="mt-3 flex flex-col gap-1">
     {inbox?.messagingEnabled !== false && <AskAboutItem storeSlug={sf.storeSlug} itemTitle={item.title} accent={c.accent} />}
     <MakeOffer storeSlug={sf.storeSlug} itemId={item.id} itemTitle={item.title} listPriceCents={item.priceCents} accent={c.accent} />
    </div>
   )}
   <p className="mt-5 text-[11px] leading-relaxed opacity-55">One-of-one vintage — once it’s gone, it’s gone. Secure checkout by Stripe.</p>
   {policy && <p className="mt-2 text-[11px] leading-relaxed opacity-60" title={policy.policyText || undefined}>{policySummary(policy)}</p>}
  </div>
 </div>
 );

 return (
 <main style={{ background: c.bg, color: c.text, fontFamily: body }} className="min-h-screen">
 {sf.enabled && !preview && (
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }} />
 )}
 {sf.enabled && !preview && <StorefrontTracker slug={sf.storeSlug} pageType="product" itemId={String(item.id)} priceCents={item.priceCents} />}
 {fams && <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?${fams}&display=swap`} />}

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
