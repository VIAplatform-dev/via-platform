// Who may take a reserved piece back: only the bag that reserved it.
//
// A reservation's owner tag says who holds the piece: the bag's own token, another buyer's
// token, "checkout", "offer-<token>", or "hold:<name>" (the seller keeping it for someone —
// see holds-core.ts). The bag retrying a checkout may release its OWN earlier reservation and
// nothing else. Releasing a hold here would sell a piece out from under the customer it was
// promised to, which is exactly what happened before this file existed.

export function mayReclaimReservation(ref: string | null | undefined, bagToken: string): boolean {
 return !!ref && !!bagToken && ref === bagToken;
}

/** Why a piece can't go in the bag, or null when it can. Same words as the product page. */
export function bagRefusal(status: string | null | undefined): string | null {
 if (status === "active") return null;
 if (status === "reserved") return "This piece is on hold for someone.";
 if (status === "sold") return "This piece has sold.";
 return "That piece is no longer available.";
}
