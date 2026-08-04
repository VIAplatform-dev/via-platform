import { notFound } from "next/navigation";
import sanitizeHtml from "sanitize-html";
import { getBaseUrl } from "@/app/lib/base-url";
import type { Metadata } from "next";
import Link from "next/link";
import { getProductById, getRecommendedProducts, getProductsByTitleKeyword } from "@/app/lib/db";
import { stores } from "@/app/lib/stores";
import { categoryMap } from "@/app/lib/categoryMap";
import { categories } from "@/app/lib/categories";
import BackButton from "@/app/components/BackButton";
import { deriveSize, convertSizeToUS } from "@/app/lib/inventory";
import { inferCategoryFromTitle, inferItemTypeFromTitle, inferColorFromTitle, inferBrandFromTitle, inferBrandKeywordFromTitle, inferItemTypeKeyword } from "@/app/lib/loadStoreProducts";
import ImageCarousel from "@/app/components/ImageCarousel";
import FavoriteButton from "@/app/components/FavoriteButton";
import AddToCartButton from "@/app/components/AddToCartButton";
import BuyNowButton from "@/app/components/BuyNowButton";
import { getProductFavoriteCount } from "@/app/lib/favorites-db";
import { getProductCartCount } from "@/app/lib/cart-db";
import ProductQuestion from "@/app/components/ProductQuestion";
import ProductAccordion from "@/app/components/ProductAccordion";
import TrackProductView from "@/app/components/TrackProductView";
import TrackedStoreLink from "@/app/components/TrackedStoreLink";
import AddToCollectionButton from "@/app/components/AddToCollectionButton";
import { formatPrice } from "@/app/lib/formatPrice";
import VyaVerifiedBadge from "@/app/components/VyaVerifiedBadge";

type ProductPageProps = {
 params: Promise<{ id: string }>;
 searchParams: Promise<{ from?: string }>;
};

// Guard against non-size values (like colors) that may have been stored as size in older syncs
const VALID_SIZE_RE = /^(?:(?:US|UK|EU|IT)\s*)?\d[\d.]*$|^(?:XS|S|M|L|XL|XXL|2XL|3XL|XXXL|OS|OSFM|One\s+Size)$/i;

const LETTER_SIZE_LABELS: Record<string, string> = {
 XS: "Extra Small (XS)", S: "Small (S)", M: "Medium (M)", L: "Large (L)",
 XL: "Extra Large (XL)", XXL: "XXL", XXXL: "XXXL", OS: "One Size", OSFM: "One Size",
};

function expandSize(size: string, categorySlug?: string, title?: string, currency?: string): string {
 const upper = size.toUpperCase();
 if (LETTER_SIZE_LABELS[upper]) return LETTER_SIZE_LABELS[upper];
 if (categorySlug) {
 const converted = convertSizeToUS(size, categorySlug, title, currency);
 if (converted) return converted;
 }
 return size;
}

// Shopify storefront UI strings that occasionally leak into scraped descriptions.
const ECOM_JUNK_LINE_RE = /regular\s+price|sale\s+price|unit\s+price|sold\s+out|in\s+stock|out\s+of\s+stock|product\s+variant|decrease\s+quantity|increase\s+quantity|add\s+to\s+(cart|bag)|pick\s+up\s+available|tax\s+included|checkout|\$\s*\d[\d,.]*|subscribe\s+to\s+our\s+emails?|payment\s+methods?|american\s+express|apple\s+pay|diners\s+club|google\s+pay|mastercard|paypal|shop\s+pay|venmo|dedication\s+to\s+excellence\s+extends\s+beyond\s+materials|we\s+will\s+exchange\s+the\s+full\s+order\s+amount|condition:\s+it\s+was\s+sent\s+out\s+in|^(email|instagram|tiktok|facebook|pinterest|twitter|youtube|snapchat)(\s+(instagram|tiktok|facebook|pinterest|twitter|youtube|snapchat|email))*$/i;

// Allowlist for seller-imported description HTML. Product descriptions are synced from
// external stores (semi-trusted), so they're rendered via dangerouslySetInnerHTML and
// MUST be sanitized — strip <script>/<iframe>/on*-handlers/javascript: URLs and keep
// only basic formatting tags.
const DESCRIPTION_SANITIZE_OPTS: sanitizeHtml.IOptions = {
 allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6", "a", "span", "blockquote"],
 allowedAttributes: { a: ["href", "target", "rel"] },
 allowedSchemes: ["http", "https", "mailto"],
 disallowedTagsMode: "discard",
 transformTags: {
  a: sanitizeHtml.simpleTransform("a", { rel: "nofollow noopener noreferrer", target: "_blank" }),
 },
};

/** Converts plain text to basic HTML, strips ecom UI junk lines, and sanitizes HTML. */
function sanitizeDescription(html: string | null): string | null {
 if (!html) return null;

 // Plain-text: convert newlines to <p> tags
 if (!/<[^>]+>/.test(html)) {
 const lines = html.split(/\n+/).map((l) => l.trim()).filter(Boolean);
 if (lines.length > 1) {
 html = lines.map((line) => `<p>${line}</p>`).join("");
 }
 }

 // Strip <p> tags whose text content is pure ecom junk
 html = html.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (match, inner) => {
 const plain = inner.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").trim();
 return ECOM_JUNK_LINE_RE.test(plain) ? "" : match;
 });

 // Final safety pass: strip anything not on the allowlist before it reaches the DOM.
 html = sanitizeHtml(html, DESCRIPTION_SANITIZE_OPTS);

 return html.trim() || null;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
 const { id: compositeId } = await params;
 const match = compositeId.match(/^(.+)-(\d+)$/);
 if (!match) return {};
 const dbId = parseInt(match[2], 10);
 if (isNaN(dbId)) return {};
 const product = await getProductById(dbId);
 if (!product) return {};

 const BASE_URL = getBaseUrl();
 const price = `$${Math.round(Number(product.price))}`;
 const categorySlug = inferCategoryFromTitle(product.title);
 const brandName = inferBrandFromTitle(product.title);
 const itemType = inferItemTypeFromTitle(product.title);

 // Rich description with brand, category, price, and store for keyword matching
 const descParts = [
 brandName ? `${brandName} ` : "",
 itemType ? `${itemType} ` : "",
 `${price}`,
 product.store_name ? ` — ${product.store_name}` : "",
 categorySlug ? `. Shop vintage ${categorySlug} on VYA.` : ". Shop vintage & secondhand on VYA.",
 ].join("").trim();

 const ogImageUrl = `${BASE_URL}/products/${compositeId}/opengraph-image`;

 return {
 title: `${product.title} — VYA`,
 description: descParts,
 keywords: [
 product.title,
 ...(brandName ? [brandName, `vintage ${brandName}`, `${brandName} vintage`] : []),
 ...(itemType ? [`vintage ${itemType}`, `secondhand ${itemType}`] : []),
 "vintage", "secondhand", "VYA", product.store_name,
 ].filter(Boolean),
 openGraph: {
 title: `${product.title} — VYA`,
 description: descParts,
 url: `${BASE_URL}/products/${compositeId}`,
 type: "website",
 images: [{ url: ogImageUrl, width: 1200, height: 630, alt: product.title }],
 },
 twitter: {
 card: "summary_large_image",
 title: `${product.title} — VYA`,
 description: descParts,
 images: [ogImageUrl],
 },
 };
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
 const { id: compositeId } = await params;
 const { from } = await searchParams;

 // Parse the DB integer ID from composite format: "store-slug-123"
 const match = compositeId.match(/^(.+)-(\d+)$/);
 if (!match) return notFound();

 const storeSlug = match[1];
 const dbId = parseInt(match[2], 10);
 if (isNaN(dbId)) return notFound();

 // Fetch product first so we can build a smarter recommendation pool
 const product = await getProductById(dbId);
 if (!product) return notFound();

 const currentBrand = inferBrandFromTitle(product.title);
 const currentBrandKeyword = inferBrandKeywordFromTitle(product.title);
 const currentItemType = inferItemTypeFromTitle(product.title);
 const currentItemTypeKeyword = inferItemTypeKeyword(product.title);
 const currentColor = inferColorFromTitle(product.title);
 const currentCategorySlug = inferCategoryFromTitle(product.title);

 // Build recommendation pool from three sources:
 // 1. Brand-keyword pool — fetches items whose title contains the brand name (e.g. "dolce & gabbana")
 // 2. Item-type pool — fetches items whose title contains the item type word (e.g. "top", "ballet flat")
 // 3. Random fallback for variety
 const [favoriteCount, cartCount, brandCandidates, itemTypeCandidates, randomCandidates] = await Promise.all([
 getProductFavoriteCount(dbId).catch(() => 0),
 getProductCartCount(dbId).catch(() => 0),
 currentBrandKeyword
 ? getProductsByTitleKeyword(currentBrandKeyword, dbId, 40).catch(() => [])
 : Promise.resolve([]),
 currentItemTypeKeyword
 ? getProductsByTitleKeyword(currentItemTypeKeyword, dbId, 40).catch(() => [])
 : Promise.resolve([]),
 getRecommendedProducts(dbId, 60).catch(() => []),
 ]);

 // Merge all pools, dedup by id
 const seen = new Set<number>();
 const allCandidates = [...brandCandidates, ...itemTypeCandidates, ...randomCandidates].filter((p) => {
 if (p.id === dbId || seen.has(p.id)) return false;
 seen.add(p.id);
 return true;
 });

 // Score each candidate:
 // same category + same brand + same item type = 10 pts (perfect match)
 // same category + same brand = 8 pts
 // same category + same item type = 7 pts
 // same brand + same item type = 5 pts
 // same category only = 5 pts
 // same brand only = 3 pts
 // same item type only = 2 pts
 // same color = 1 pt tiebreaker
 const scored = allCandidates.map((p) => {
 const pCategory = inferCategoryFromTitle(p.title);
 const pBrand = inferBrandFromTitle(p.title);
 const pItemType = inferItemTypeFromTitle(p.title);
 const pColor = inferColorFromTitle(p.title);
 let score = 0;
 if (pCategory === currentCategorySlug) score += 5;
 if (currentBrand && pBrand === currentBrand) score += 3;
 if (currentItemType && pItemType === currentItemType) score += 2;
 if (currentColor && pColor === currentColor) score += 1;
 return { product: p, score };
 });

 scored.sort((a, b) => b.score - a.score);

 // If there are at least 4 same-category candidates, only show same-category results.
 // This prevents a bag or earrings from appearing when viewing a top or dress.
 const sameCategoryScored = scored.filter((s) => inferCategoryFromTitle(s.product.title) === currentCategorySlug);
 const finalPool = sameCategoryScored.length >= 4 ? sameCategoryScored : scored;
 const recommendations = finalPool.slice(0, 4).map((s) => s.product);

 const storeConfig = stores.find((s) => s.slug === storeSlug);
 const store = storeConfig ?? {
 slug: product.store_slug,
 name: product.store_name,
 location: "",
 };

 const categorySlug = currentCategorySlug;
 const categoryLabel = categoryMap[categorySlug];
 const price = formatPrice(Number(product.price), product.currency);
 const compareAtPrice =
 product.compare_at_price && Number(product.compare_at_price) > Number(product.price)
 ? formatPrice(Number(product.compare_at_price), product.currency)
 : null;

 // Use deriveSize to extract the correct size (checks title first, then description, then DB)
 const rawSize = deriveSize(product);
 const displaySize = rawSize ? expandSize(rawSize, currentCategorySlug, product.title, product.currency) : null;

 // Parse images from DB
 let productImages: string[] = [];
 if (product.images) {
 try {
 const parsed = JSON.parse(product.images);
 if (Array.isArray(parsed) && parsed.length > 0) productImages = parsed;
 } catch {}
 }
 if (productImages.length === 0 && product.image) {
 productImages = [product.image];
 }

 // Some stores list a video instead of (or alongside) photos. Show it first.
 const videoUrl = product.video_url || null;

 // Build direct cart URL for Shopify stores only (variant IDs are numeric).
 // Square/Squarespace stores use their own URL format — use external_url as-is.
 let checkoutUrl = product.external_url || "";
 if (product.variant_id && product.external_url && (store as any).commissionType === "shopify-collabs") {
 try {
 const productUrl = new URL(product.external_url);
 checkoutUrl = `${productUrl.origin}/cart/${product.variant_id}:1`;
 } catch {}
 }
 const descriptionHtml = sanitizeDescription(product.description);

 const BASE_URL = getBaseUrl();
 const brandName = inferBrandFromTitle(product.title);
 // Point structured-data images at our own domain (the /i proxy) rather than the seller's
 // cdn.shopify.com, so Google attributes the photos to THIS page and can surface it in
 // reverse-image search. Same images are also declared in the image sitemap.
 const seoImages = productImages.map((_, i) => `${BASE_URL}/i/${compositeId}/${i}.jpg`);
 const jsonLd = {
 "@context": "https://schema.org",
 "@type": "Product",
 "name": product.title,
 "description": product.description
  ? product.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500)
  : `${product.title} — vintage & secondhand at VYA`,
 "image": seoImages.length ? seoImages : productImages,
 "url": `${BASE_URL}/products/${compositeId}`,
 ...(brandName ? { "brand": { "@type": "Brand", "name": brandName } } : {}),
 ...(product.materials ? { "material": product.materials } : {}),
 "offers": {
  "@type": "Offer",
  "price": Number(product.price).toFixed(2),
  "priceCurrency": product.currency || "USD",
  "availability": "https://schema.org/InStock",
  "url": `${BASE_URL}/products/${compositeId}`,
  "seller": { "@type": "Organization", "name": store.name, "url": (store as any).website ?? "" },
 },
 "itemCondition": "https://schema.org/UsedCondition",
 };

 return (
 <main className="bg-[#FFFDF8] min-h-screen">
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
 <TrackProductView
 productId={compositeId}
 title={product.title}
 price={Number(product.price)}
 category={categoryLabel}
 storeName={store.name}
 storeSlug={store.slug}
 size={displaySize}
 />
 {/* Back nav */}
 <div className="max-w-6xl mx-auto px-6 pt-4 pb-2 md:pt-8 md:pb-4">
 <BackButton
 label={from?.startsWith("/categories/")
 ? categories.find((c) => `/categories/${c.slug}` === from)?.label ?? "Category"
 : from === "/browse"
 ? "Browse"
 : store.name}
 />
 </div>

 {/* Product layout */}
 <div className="max-w-6xl mx-auto px-6 pb-24">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-16 md:items-start">

 {/* Images — carousel on mobile, vertical stack on desktop. A video (if the
 store listed one) leads the gallery. */}
 <div>
 <div className="md:hidden -mx-6">
 {videoUrl && (
 <video
 src={videoUrl}
 controls
 playsInline
 preload="metadata"
 poster={productImages[0] || undefined}
 className="aspect-[3/4] w-full bg-[#D8CABD]/20 object-cover object-center"
 />
 )}
 {productImages.length > 0 && (
 <ImageCarousel images={productImages} alt={product.title} variant="detail" priority />
 )}
 </div>
 <div className="hidden md:flex flex-col gap-2">
 {videoUrl && (
 <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#D8CABD]/20">
 <video
 src={videoUrl}
 controls
 playsInline
 preload="metadata"
 poster={productImages[0] || undefined}
 className="h-full w-full object-cover object-center"
 />
 </div>
 )}
 {productImages.length > 0 ? productImages.map((src, i) => (
 <div key={i} className="relative aspect-[3/4] w-full overflow-hidden bg-[#D8CABD]/20">
 <img
 src={src}
 alt={`${product.title}${i > 0 ? ` — image ${i + 1}` : ""}`}
 className="w-full h-full object-cover object-center"
 loading={i === 0 ? "eager" : "lazy"}
 />
 </div>
 )) : (
 !videoUrl && <div className="aspect-[3/4] w-full bg-[#D8CABD]/30" />
 )}
 </div>
 </div>

 {/* Details — sticky on desktop, independently scrollable if content exceeds viewport */}
 <div className="flex flex-col pt-4 pb-1 md:pt-1 md:sticky md:top-8 md:self-start md:max-h-[calc(100vh-4rem)] md:overflow-y-auto md:pr-2 scrollbar-hide">
 <TrackedStoreLink
 href={`/stores/${store.slug}`}
 storeSlug={store.slug}
 storeName={store.name}
 surface="product_detail"
 className="text-xs uppercase tracking-[0.2em] text-black/50 hover:text-black transition mb-1"
 >
 {store.name}
 </TrackedStoreLink>

 <h1 className="text-xl sm:text-4xl font-serif text-black leading-snug mb-1">
 {product.title}
 </h1>

 <p className="text-sm text-black/50 mb-0.5">{categoryLabel}</p>

 {displaySize && (
 <p className="text-sm text-black/70 mb-0.5">
 Size: <span className="font-medium">{displaySize}</span>
 </p>
 )}

 <div className="flex items-center gap-4 mb-4 md:mb-8">
 <div className="flex items-baseline gap-2">
 <p className="text-2xl font-medium text-black">{price}</p>
 {compareAtPrice && (
 <p className="text-base text-black/40 line-through">{compareAtPrice}</p>
 )}
 </div>
 <FavoriteButton type="product" targetId={dbId} size="md" favoriteCount={favoriteCount} />
 {cartCount > 0 && (
 <span className="text-xs text-black/50">
 {cartCount} {cartCount === 1 ? "person has" : "people have"} this in their cart
 </span>
 )}
 </div>

 {/* VYA Verified — links to the trust / authenticity page */}
 <div className="-mt-2 mb-4 md:mb-8">
 <VyaVerifiedBadge />
 </div>

 {/* Accordion details */}
 <div className="mb-4 md:mb-8">
 <ProductAccordion
 sections={[
                {
                  title: "Product Details",
                  content: (
                    <div className="space-y-3">
                      {displaySize && (
                        <p><span className="font-medium">Size:</span> {displaySize}</p>
                      )}
                      {/* Structured specs the seller stated on their own listing (captured at sync). */}
                      {product.condition && (
                        <p><span className="font-medium">Condition:</span> {product.condition}</p>
                      )}
                      {product.materials && (
                        <p><span className="font-medium">Materials:</span> {product.materials}</p>
                      )}
                      {product.measurements && (
                        <p><span className="font-medium">Measurements:</span> {product.measurements}</p>
                      )}
                      {descriptionHtml ? (
                        <div
                          className="product-description prose prose-sm max-w-none [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1 [&_strong]:text-black [&_h1]:text-lg [&_h1]:font-serif [&_h2]:text-base [&_h2]:font-serif [&_h3]:text-sm [&_h3]:font-medium [&_br]:block"
                          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                        />
                      ) : !displaySize ? (
                        <p className="text-black/60 italic">No additional details — visit the store listing for more information.</p>
                      ) : null}
                    </div>
                  ),
                },
 {
 title: "Authenticity & Curation",
 content: (() => {
 // Standard authenticity statement shown on every product (replaces the
 // inconsistent per-store copy; stores.ts `authenticityPolicy` is now unused).
 const policyText = `Every piece at ${store.name} is personally sourced, authenticated, and inspected before listing, then accurately described — so you can shop with complete confidence.`;
 const paragraphs = policyText.split(/\n\n+/);
 return (
 <div className="space-y-3">
 {paragraphs.map((para, i) =>
 i === 0 && para.length < 60 ? (
 <p key={i} className="font-medium">{para}</p>
 ) : (
 <p key={i}>{para}</p>
 )
 )}
 </div>
 );
 })(),
 },
 {
 title: "Shipping & Returns",
 content: (
 <div>
 {storeConfig?.perk && (
 <p className="mb-3 font-medium text-black">{storeConfig.perk}</p>
 )}
 <p className="mb-1 font-medium text-black text-xs uppercase tracking-wide">Shipping</p>
 <p className="mb-4">
 {storeConfig?.shippingPolicy ??
 `This item ships directly from ${store.name}${storeConfig?.location ? ` (${storeConfig.location})` : ""}. Shipping rates and delivery times are determined by the store at checkout.`}
 </p>
 <p className="mb-1 font-medium text-black text-xs uppercase tracking-wide">Returns</p>
 <p>
 {storeConfig?.returnPolicy ??
 `All sales are final. Please review all item details carefully before purchasing.`}
 </p>
 </div>
 ),
 },
 ]}
 />
 </div>

 <ProductQuestion
 productTitle={product.title}
 storeName={store.name}
 productUrl={`https://vyaplatform.com/products/${compositeId}`}
 />

 {/* CTAs — Buy Now primary, Add to Cart secondary */}
 {product.external_url ? (
 <>
 <BuyNowButton
 compositeId={compositeId}
 title={product.title}
 price={formatPrice(Number(product.price), product.currency)}
 image={productImages[0] || ""}
 storeName={store.name}
 storeSlug={store.slug}
 externalUrl={product.external_url || ""}
 checkoutUrl={checkoutUrl}
 />
 <AddToCartButton
 item={{
 compositeId,
 title: product.title,
 price: Number(product.price),
 image: productImages[0] || "",
 storeName: store.name,
 storeSlug: store.slug,
 externalUrl: product.external_url,
 checkoutUrl,
 collabsLink: product.collabs_link ?? undefined,
 }}
 />
 </>
 ) : (
 <Link
 href={`/stores/${store.slug}`}
 className="block w-full border border-[#5D0F17]/30 text-[#5D0F17]/60 py-4 text-sm uppercase tracking-wide text-center hover:bg-[#5D0F17]/5 transition"
 >
 Browse {store.name} →
 </Link>
 )}

 <AddToCollectionButton
 productId={dbId}
 snapshot={{
 title: product.title,
 price: Number(product.price),
 image: productImages[0] || "",
 store: store.name,
 storeSlug: store.slug,
 }}
 />
 </div>
 </div>
 </div>

 {/* Recommendations section */}
 {recommendations.length > 0 && (
 <section className="border-t border-neutral-200 bg-[#f7f6f3]">
 <div className="max-w-6xl mx-auto px-6 py-16 md:py-20">
 <h2 className="font-serif text-2xl sm:text-3xl text-black text-center mb-10">
 We think you&apos;d like these too
 </h2>

 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
 {recommendations.map((rec) => {
 const recId = `${rec.store_slug}-${rec.id}`;
 const recPrice = formatPrice(Number(rec.price), rec.currency);
 const recCategory = categoryMap[inferCategoryFromTitle(rec.title)];

 let recImages: string[] = [];
 if (rec.images) {
 try {
 const parsed = JSON.parse(rec.images);
 if (Array.isArray(parsed) && parsed.length > 0)
 recImages = parsed;
 } catch {}
 }
 if (recImages.length === 0 && rec.image) {
 recImages = [rec.image];
 }

 return (
 <Link
 key={rec.id}
 href={`/products/${recId}`}
 className="group block bg-white rounded-sm overflow-hidden transition-shadow duration-300 hover:shadow-lg"
 >
 <div className="relative aspect-[3/4] overflow-hidden">
 {recImages.length > 0 ? (
 <img
 src={recImages[0]}
 alt={rec.title}
 className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
 />
 ) : (
 <div className="w-full h-full bg-neutral-100 flex items-center justify-center">
 <span className="text-neutral-400 text-xs uppercase tracking-wide">
 No image
 </span>
 </div>
 )}
 </div>

 <div className="p-3 sm:p-4">
 <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-black/50 mb-1">
 {rec.store_name}
 </p>
 <h3 className="font-serif text-sm sm:text-base text-black leading-snug line-clamp-2 mb-1">
 {rec.title}
 </h3>
 <p className="text-[11px] sm:text-xs text-black/50 mb-2">
 {recCategory}
 </p>
 <p className="text-sm font-medium text-black mb-3">
 {recPrice}
 </p>
 <span className="inline-block text-[11px] sm:text-xs uppercase tracking-[0.15em] text-black/60 group-hover:text-black transition-colors duration-300">
 View Details &rarr;
 </span>
 </div>
 </Link>
 );
 })}
 </div>
 </div>
 </section>
 )}
 </main>
 );
}
