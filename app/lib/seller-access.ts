// ───────────────────────────────────────────────────────────────────────────
// Who is allowed to open a store on VYA.
//
// getvya.ai is invite-only while the pilot runs. Until now anything that could get a magic link
// could create a store — which means the first stranger who found the URL would have had a
// storefront, a slug and a row in every table, and we'd have found out from the database.
//
// Deliberately NOT the same list as `pilot_access`. That one is shoppers waiting to browse the
// marketplace; this one is sellers invited to run a shop. Conflating them means approving a shopper
// hands them a store, which is not what approving a shopper means.
//
// Fails CLOSED: no invite, no store. The one exception is the VYA owner's own admin cookie, so
// support can always set a shop up alongside someone.
// ───────────────────────────────────────────────────────────────────────────

export type InviteDecision =
 | { ok: true; reason: "invited" | "owner" | "already-has-a-store" }
 | { ok: false; reason: "not-invited" | "no-email" };

export function normaliseEmail(email: string | null | undefined): string {
 return String(email || "").trim().toLowerCase();
}

export function isEmail(email: string): boolean {
 return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

/**
 * May this person open a store?
 *
 * Everything needed is passed in, so the rule is testable and reads in one place rather than being
 * spread across a route. Someone who ALREADY has a store keeps it whatever the invite list says —
 * revoking an invite must not lock a seller out of a shop she's been running.
 */
export function mayOpenStore(input: {
 email: string | null | undefined;
 invited: boolean;
 isVyaOwner?: boolean;
 hasStoreAlready?: boolean;
}): InviteDecision {
 const email = normaliseEmail(input.email);
 if (!email || !isEmail(email)) return { ok: false, reason: "no-email" };
 if (input.hasStoreAlready) return { ok: true, reason: "already-has-a-store" };
 if (input.isVyaOwner) return { ok: true, reason: "owner" };
 if (input.invited) return { ok: true, reason: "invited" };
 return { ok: false, reason: "not-invited" };
}

/** What to say to someone who isn't on the list. Not an error — they've done nothing wrong. */
export const NOT_INVITED_MESSAGE =
 "VYA is invite-only at the moment. If you'd like a store, ask us for an invite and we'll add your email.";


/**
 * Which slug a new store gets.
 *
 * Extracted from the onboarding route so the trap it exists to avoid can be proven rather than
 * asserted: a store imported ahead of a seller signing up OWNS the slug her name would generate.
 * Left to `generateUniqueSlug`, she'd be handed "…-2" — an empty shop, with her real one and every
 * imported piece sitting one row away, and nothing on screen to explain it.
 */
export function chooseStoreSlug(input: {
 /** The store held for her, already checked as unclaimed. */
 reserved: string | null;
 /** What her store name would generate. */
 generated: string;
 /** Whether she said she has a website to import. */
 hasWebsite: boolean | null;
}): { slug: string; seeded: boolean } {
 // Only when she says she's importing. Someone who chose to start fresh has answered the question,
 // and handing her a pre-filled shop would be overruling her.
 if (input.hasWebsite === true && input.reserved) return { slug: input.reserved, seeded: true };
 return { slug: input.generated, seeded: false };
}
