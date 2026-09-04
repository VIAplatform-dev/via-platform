import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { ownerOfItem, rentalContext } from "@/app/lib/rentals/rentals-db";
import type { RentalSettings } from "@/app/lib/rentals/settings-core";
import type { Span, Tier } from "@/app/lib/rentals/availability-core";
import { isDay } from "@/app/lib/rentals/availability-core";

// Shared plumbing for the rental endpoints. Two kinds of caller:
//  · the SELLER, working in the admin, identified by the store session;
//  · a SHOPPER on a storefront, who has an item id and nothing else.
// The second is why context is resolved from the item rather than the request.

export const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
export const notFound = (what = "Not found") => NextResponse.json({ error: what }, { status: 404 });
export const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function seller(request: NextRequest) {
 return actingSeller(request);
}

/** Today in the store's own reckoning. UTC for now — a per-store timezone is a later setting. */
export function today(): string {
 return new Date().toISOString().slice(0, 10);
}

export function spanFrom(body: Record<string, unknown>): Span | null {
 const start = typeof body.start === "string" ? body.start : "";
 const end = typeof body.end === "string" ? body.end : "";
 return isDay(start) && isDay(end) ? { start, end } : null;
}

export type PublicContext = { sellerId: string; storeSlug: string; settings: RentalSettings; tiers: Tier[]; fitsSizes: string | null; replacementCents: number | null };

/**
 * Resolve a rentable item for a storefront caller. Returns null when the piece
 * doesn't exist, the store hasn't switched rentals on, or the piece simply has
 * no rental terms — all of which look the same to a shopper: not for rent.
 */
export async function rentableItem(itemId: string): Promise<PublicContext | null> {
 const owner = await ownerOfItem(itemId);
 if (!owner) return null;
 const { settings, terms } = await rentalContext(itemId, owner.storeSlug);
 if (!settings.enabled || !terms) return null;
 return {
  sellerId: owner.sellerId,
  storeSlug: owner.storeSlug,
  settings,
  tiers: terms.tiers,
  fitsSizes: terms.fitsSizes,
  replacementCents: terms.replacementCents,
 };
}
