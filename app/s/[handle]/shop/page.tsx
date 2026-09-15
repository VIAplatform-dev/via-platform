import { notFound } from "next/navigation";
import { getStorefrontByHandleAny } from "@/app/lib/storefront-db";
import { storefrontVisibility } from "@/app/lib/storefront-visibility";
import StorefrontView from "../../StorefrontView";
import StorefrontTracker from "../../StorefrontTracker";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<{ preview?: string; category?: string; q?: string }> };

// The Shop page: products live here, on their own page, matching real sites.
export default async function ShopPage({ params, searchParams }: Props) {
 const { handle } = await params;
 const { preview, category, q } = await searchParams;

 // Resolved whether or not it is published. An unpublished shop shows its preview.
 const sf = await getStorefrontByHandleAny(handle).catch(() => null);
 if (!sf) return notFound();
 const visibility = storefrontVisibility(!!sf.enabled);
 const previewing = visibility === "preview";

 return (
 <>
 {!sf.enabled && (
 <div className="bg-[#5D0F17] py-1.5 text-center text-[11px] uppercase tracking-[0.2em] text-white">Preview · not live yet</div>
 )}
 <StorefrontView settings={sf} view="shop" preview={previewing} category={category} query={q} />
 {visibility === "live" && <StorefrontTracker slug={sf.storeSlug} pageType="shop" search={q} />}
 </>
 );
}
