import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { getAppointmentSettings } from "@/app/lib/appointments/appointments-db";
import { ownerOfItem } from "@/app/lib/rentals/rentals-db";

export const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
export const notFound = (what = "Not found") => NextResponse.json({ error: what }, { status: 404 });
export const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
export const seller = (request: NextRequest) => actingSeller(request);
export const today = () => new Date().toISOString().slice(0, 10);

/**
 * Public store context. A shopper has no session, so it comes from what the page knows: a STORE
 * slug (an appointments section anywhere on the site) or an ITEM (the rent box, which knows its
 * piece). Never asks whether the store rents — appointments are their own feature.
 */
export async function publicContext(params: { storeSlug?: string; itemId?: string; request?: NextRequest }) {
 let sellerId: string | null = null;
 let storeSlug: string | null = null;
 if (params.storeSlug) {
  const s = await getSellerBySlug(params.storeSlug).catch(() => null);
  if (s) { sellerId = s.id; storeSlug = params.storeSlug; }
 } else if (params.itemId) {
  const owner = await ownerOfItem(params.itemId);
  if (owner) ({ sellerId, storeSlug } = owner);
 } else if (params.request) {
  // No slug and no item — the storefront EDITOR, where the seller is signed in. Without this the
  // canvas can never show a shop its own diary, which is exactly where it needs to see it.
  const acting = await actingSeller(params.request);
  if (acting) { sellerId = acting.seller.id; storeSlug = acting.slug; }
 }
 if (!sellerId || !storeSlug) return null;
 const settings = await getAppointmentSettings(storeSlug);
 if (!settings.enabled) return null;
 return { sellerId, storeSlug, settings };
}
