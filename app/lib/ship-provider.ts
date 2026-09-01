// Shipping provider adapter. Everything that buys labels imports from HERE, not from a specific
// provider, so switching providers is a one-file change. Default is Shippo (current prod behaviour,
// untouched). Set SHIP_PROVIDER=easypost to route through EasyPost instead.
//
// `accountId` is the store's shipping sub-account handle (EasyPost Child-User key). Null ⇒ run on the
// platform's own account — which is today's behaviour AND the pre-Forge EasyPost path. Per-store
// sub-accounts stay dormant until Forge is enabled (see getOrCreateShipAccount).

import * as shippo from "./shippo";
import * as easypost from "./easypost";
import type { ShipAddress, Parcel, Rate, PurchasedLabel } from "./shippo";
import type { CustomsDeclaration } from "./customs";
import { getShipAccountId, saveShipAccount } from "./seller-payments-db";

export type ShipProviderName = "shippo" | "easypost";

export function activeProvider(): ShipProviderName {
 return process.env.SHIP_PROVIDER === "easypost" ? "easypost" : "shippo";
}

export function isShipConfigured(): boolean {
 return activeProvider() === "easypost" ? easypost.isEasyPostConfigured() : shippo.isShippoConfigured();
}

export async function getRates(from: ShipAddress, to: ShipAddress, parcel: Parcel, accountId?: string | null, customs?: CustomsDeclaration | null): Promise<Rate[]> {
 return activeProvider() === "easypost"
  ? easypost.getRates(from, to, parcel, accountId ?? undefined, customs)
  : shippo.getRates(from, to, parcel, customs); // Shippo managed-account header wires in when we move Shippo to Platform Accounts
}

export async function buyLabel(rateId: string, accountId?: string | null): Promise<PurchasedLabel | null> {
 return activeProvider() === "easypost"
  ? easypost.buyLabel(rateId, accountId ?? undefined)
  : shippo.buyLabel(rateId);
}

export async function voidLabel(transactionId: string, accountId?: string | null): Promise<boolean> {
 return activeProvider() === "easypost"
  ? easypost.voidLabel(transactionId, accountId ?? undefined)
  : shippo.voidLabel(transactionId);
}

/**
 * Resolve (creating on first use) a store's shipping sub-account handle — the "automation" that makes
 * every new store self-provision with no manual step, mirroring how payments/connect auto-creates each
 * store's Stripe Express account. Returns null (⇒ platform account) unless the sub-account path is fully
 * turned on, so it's a safe no-op today:
 *   • Provider must be EasyPost and EASYPOST_API_KEY set, AND
 *   • SHIP_SUBACCOUNTS=on — an explicit gate so we don't spawn Child Users during testing or before
 *     Forge is enabled + the child-auth/FlexRate flow is verified live.
 */
export async function getOrCreateShipAccount(storeSlug: string, storeName: string): Promise<string | null> {
 if (activeProvider() !== "easypost" || !easypost.isEasyPostConfigured()) return null;
 const existing = await getShipAccountId(storeSlug).catch(() => null);
 if (existing) return existing;
 if (process.env.SHIP_SUBACCOUNTS !== "on") return null; // dormant until Forge is verified + enabled
 const child = await easypost.createChildUser(storeName).catch(() => null);
 if (!child?.apiKey) return null;
 await saveShipAccount(storeSlug, child.apiKey).catch(() => {}); // the Child-User key is how we act as this store
 return child.apiKey;
}
