/**
 * What a shopper is told about a piece that cannot be bought.
 *
 * There are two quite different reasons a piece is unbuyable, and until now the store said "Sold
 * out" for both:
 *
 *   • The seller's own platform reported it sold out while still listing it. That is their
 *     statement, and repeating it is honest.
 *   • It simply disappeared from their feed. Sold, deleted, unpublished, moved — the platform does
 *     not say, and we cannot tell. blummier's nine were all dead links on her own store.
 *
 * Saying "Sold" for the second kind asserts a sale nobody can evidence. 244 pieces across the fleet
 * were doing exactly that. The reason is now RECORDED at the moment we learn it rather than inferred
 * later: it used to be recoverable only because vanished pieces happened to carry a date stamp and
 * imported sold-out ones happened not to, which is an accident, not a design.
 */

export type UnavailableReason = "sold_out" | "vanished" | "on_hold" | null | undefined;

const LABEL: Record<string, string> = {
 sold_out: "Sold out",
 vanished: "No longer available",
 // Kept back for a named customer (holds-core.ts). Not sold — it comes back on sale by itself when
 // the hold lapses — so the badge must not say so. Never stored: computed from `status`.
 on_hold: "On hold",
};

/**
 * The words on the badge and on the dead buy button.
 *
 * An unlabelled piece — imported before the reason was recorded — keeps "Sold out". Relabelling it
 * on no evidence would be the same overreach in the opposite direction.
 */
export function unavailableLabel(reason: string | null | undefined): string {
 return (reason && LABEL[reason]) || LABEL.sold_out;
}

/** What the seller's feed told us, at import. `available === false` is their own statement. */
export function reasonFromImport(available: boolean | undefined): "sold_out" | null {
 return available === false ? "sold_out" : null;
}

/** What the sweep concluded when a piece stopped appearing in the feed. An inference, labelled so. */
export function reasonForVanished(): "vanished" {
 return "vanished";
}

/**
 * What the storefront should say about a piece's availability, from the row itself.
 *
 * `reserved` covers two things the shopper cannot tell apart and should not be able to buy: a
 * buyer mid-checkout (gone in ten minutes, one way or the other) and a hold for a named customer
 * (gone for days). Both read "On hold" on the shelf — a piece that vanished from the grid the
 * moment someone was holding it looked, to the seller, like a piece that had been deleted.
 */
export function storefrontAvailability(it: { status?: string | null; unavailableReason?: string | null }): { available: boolean; unavailableReason: string | null } {
 if (it.status === "reserved") return { available: false, unavailableReason: "on_hold" };
 if (it.status === "sold") return { available: false, unavailableReason: it.unavailableReason ?? null };
 return { available: true, unavailableReason: null };
}
