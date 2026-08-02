import { notFound } from "next/navigation";
import { getStorefrontByHandle, getStorefrontByHandleAny } from "@/app/lib/storefront-db";
import StorefrontView from "../../../StorefrontView";
import StorefrontTracker from "../../../StorefrontTracker";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string; slug: string }>; searchParams: Promise<{ preview?: string; q?: string }> };

// A collection page on a built-from-scratch store — shows the items assigned to the
// collection (or the whole catalogue for "all"), using the store's own theme. Mirrors
// what imported stores get on their /collections/{handle} pages.
export default async function CollectionPage({ params, searchParams }: Props) {
 const { handle, slug } = await params;
 const { preview, q } = await searchParams;

 const sf = preview ? await getStorefrontByHandleAny(handle).catch(() => null) : await getStorefrontByHandle(handle).catch(() => null);
 if (!sf) return notFound();

 return (
 <>
 {!sf.enabled && (
 <div className="bg-[#5D0F17] py-1.5 text-center text-[11px] uppercase tracking-[0.2em] text-white">Preview · not live yet</div>
 )}
 <StorefrontView settings={sf} view="shop" preview={!!preview} collectionSlug={slug} query={q} />
 {sf.enabled && !preview && <StorefrontTracker slug={sf.storeSlug} pageType="collection" search={q} />}
 </>
 );
}
