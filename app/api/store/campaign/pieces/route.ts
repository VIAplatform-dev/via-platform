import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { listStorefrontItems } from "@/app/lib/db/inventory";

export const dynamic = "force-dynamic";

// GET — the pieces a seller can put in an email. Live listings only: an email that links to
// something already sold is worse than one piece short.
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const seller = await getSellerBySlug(slug).catch(() => null);
 if (!seller) return NextResponse.json({ ok: true, pieces: [] });
 const items = await listStorefrontItems(seller.id).catch(() => []);
 return NextResponse.json({
  ok: true,
  pieces: items.slice(0, 60).map((i) => ({
   id: i.id,
   title: i.title,
   image: (i.images as string[] | null)?.[0] ?? null,
   price: i.priceCents == null ? null : `$${Math.round(i.priceCents / 100).toLocaleString()}`,
  })),
 });
}
