import { notFound, redirect } from "next/navigation";
import { storePublicOrigin } from "@/app/lib/plan-b/store-host";
import type { Metadata } from "next";
import { stores } from "@/app/lib/stores";
import { getStorefrontByHandle, getStorefrontByHandleAny } from "@/app/lib/storefront-db";
import { hasCaptures } from "@/app/lib/site-capture-db";
import { servesCapture } from "@/app/lib/storefront-versions";
import StorefrontView from "../StorefrontView";
import StorefrontTracker from "../StorefrontTracker";

export const dynamic = "force-dynamic";

const STOREFRONT_BASE = "https://vyaplatform.com";

// The store's display name works for curated marketplace stores AND self-onboarded ones
// (whose name lives on the storefront theme, not the static stores list).
function storeDisplayName(sf: { storeSlug: string; theme?: { storeName?: string | null } | null }, handle: string): string {
 const curated = stores.find((s) => s.slug === sf.storeSlug);
 return sf.theme?.storeName || curated?.name || handle.replace(/-/g, " ");
}

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<{ preview?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
 const { handle } = await params;
 const sf = await getStorefrontByHandleAny(handle).catch(() => null);
 if (!sf) return { title: "Storefront" };
 const name = storeDisplayName(sf, handle);
 const description = sf.tagline || (sf.about ? sf.about.slice(0, 160) : `Shop ${name} — vintage and one-of-a-kind pieces.`);
 const image = sf.heroImage || undefined;
 // Index a LIVE storefront so it's findable on Google. If the store connected a custom
 // domain, that domain is canonical — noindex this /s/{handle} mirror and point canonical
 // at the domain, so search indexes the real domain instead of a duplicate.
 // A store's real address is its own: the domain it connected, else its {slug}.vyasites.com origin.
 // /s/{handle} is a mirror of it, so it points canonical at the real one and stays out of the index
 // — otherwise Google picks between two copies of the same shop and often picks ours.
 const hasDomain = !!sf.customDomain;
 const ownOrigin = storePublicOrigin(sf.storeSlug);
 const url = hasDomain ? `https://${sf.customDomain}` : (ownOrigin ?? `${STOREFRONT_BASE}/s/${handle}`);
 const isMirror = hasDomain || !!ownOrigin;
 return {
 title: name,
 description,
 alternates: { canonical: url },
 robots: { index: sf.enabled && !isMirror, follow: true },
 openGraph: { title: name, description, type: "website", url, siteName: name, ...(image ? { images: [{ url: image }] } : {}) },
 twitter: { card: image ? "summary_large_image" : "summary", title: name, description, ...(image ? { images: [image] } : {}) },
 };
}

export default async function StorefrontPage({ params, searchParams }: Props) {
 const { handle } = await params;
 const { preview } = await searchParams;

 // Public access only resolves *live* storefronts; ?preview resolves it even when
 // off (the owner previewing), with a "not live yet" ribbon.
 const sf = preview
 ? await getStorefrontByHandleAny(handle).catch(() => null)
 : await getStorefrontByHandle(handle).catch(() => null);
 if (!sf) return notFound();

 // Which storefront is live is the seller's choice now, not a consequence of what she happens to
 // have. This used to be "any captured pages? then serve those", which meant a store that had ever
 // imported its site could never publish a design built here — the captures always won. The
 // published version decides; the capture check is only the fallback for stores that predate
 // versions and so have no published row yet. See storefront-versions.ts.
 if (!preview && servesCapture(sf.serveMode, await hasCaptures(sf.storeSlug).catch(() => false))) {
  redirect(`/site/${sf.storeSlug}`);
 }

 // Store structured data → search engines treat the storefront as a real shop entity.
 const name = storeDisplayName(sf, handle);
 // The store's own address, so structured data names the same URL as the canonical tag.
 const storeUrl = sf.customDomain
  ? `https://${sf.customDomain}`
  : (storePublicOrigin(sf.storeSlug) ?? `${STOREFRONT_BASE}/s/${handle}`);
 const storeLd = {
 "@context": "https://schema.org",
 "@type": "Store",
 name,
 url: storeUrl,
 ...(sf.tagline || sf.about ? { description: (sf.tagline || sf.about || "").slice(0, 300) } : {}),
 ...(sf.heroImage ? { image: sf.heroImage } : {}),
 };

 return (
 <>
 {sf.enabled && !preview && (
 <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(storeLd) }} />
 )}
 {sf.enabled && !preview && <StorefrontTracker slug={sf.storeSlug} pageType="home" />}
 {!sf.enabled && (
 <div className="bg-[#5D0F17] py-1.5 text-center text-[11px] uppercase tracking-[0.2em] text-[#FFFDF8]">
 Preview · not live yet
 </div>
 )}
 <StorefrontView settings={sf} preview={!!preview} />
 </>
 );
}
