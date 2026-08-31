import { NextRequest } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getOrCreateSeller } from "@/app/lib/db/sellers";
import { stores, storeContactEmails } from "@/app/lib/stores";
import type { Seller } from "@/app/lib/db/schema";

// The acting store for a Market Mode request — web session, admin preview (?store=) or the mobile
// JWT — plus its `sellers` row (created lazily, like the intake publish route does).
export async function actingSeller(request: NextRequest): Promise<{ slug: string; seller: Seller } | null> {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return null;
 const store = stores.find((s) => s.slug === slug);
 const seller = await getOrCreateSeller(slug, store?.name || slug, storeContactEmails[slug] || "");
 return { slug, seller };
}
