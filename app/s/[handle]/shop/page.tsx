import { notFound } from "next/navigation";
import { getStorefrontByHandle, getStorefrontByHandleAny } from "@/app/lib/storefront-db";
import StorefrontView from "../../StorefrontView";
import StorefrontTracker from "../../StorefrontTracker";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<{ preview?: string; category?: string; q?: string }> };

// The Shop page — products live here, on their own page, matching real sites.
export default async function ShopPage({ params, searchParams }: Props) {
 const { handle } = await params;
 const { preview, category, q } = await searchParams;

 const sf = preview ? await getStorefrontByHandleAny(handle).catch(() => null) : await getStorefrontByHandle(handle).catch(() => null);
 if (!sf) return notFound();

 return (
 <>
 {!sf.enabled && (
 <div className="bg-[#5D0F17] py-1.5 text-center text-[11px] uppercase tracking-[0.2em] text-white">Preview · not live yet</div>
 )}
 <StorefrontView settings={sf} view="shop" preview={!!preview} category={category} query={q} />
 {sf.enabled && !preview && <StorefrontTracker slug={sf.storeSlug} pageType="shop" search={q} />}
 </>
 );
}
