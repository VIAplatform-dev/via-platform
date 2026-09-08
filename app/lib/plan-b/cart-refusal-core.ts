// Why the seller's own Add-to-cart button (driving VYA's bag) turns a piece away. Pure — no I/O.
//
// One-of-one: a piece that cannot be bought is refused in the theme's own error shape. The words
// used to be "has sold" for every refusal, which told the customer a held piece was gone. They now
// come from the same label the shelf badge and the dead buy button use (unavailable-label.ts), so a
// held piece says on hold, a sold one sold out, and one that merely vanished from the seller's feed
// says only that it is no longer available.

import { storefrontAvailability, unavailableLabel } from "../unavailable-label.ts";

/** Statuses a shopper may add to a cart. A native listing is buyable as a draft on a hosted page
 *  the same way it always was; a sold, held or removed one-of-one is not backorderable. */
export const SELLABLE_STATUSES = ["active", "draft"] as const;

export function hostedCartRefusal(item: { title: string; status: string; unavailableReason?: string | null }): string | null {
 const shelf = storefrontAvailability(item);
 if (!shelf.available) return `${item.title} is ${unavailableLabel(shelf.unavailableReason).toLowerCase()}.`;
 if (!(SELLABLE_STATUSES as readonly string[]).includes(item.status)) return `${item.title} is no longer available.`;
 return null;
}
