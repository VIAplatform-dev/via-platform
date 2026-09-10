// Who owns a shop, when the two records of it disagree.
//
// A store keeps its ownership in two places: `store_accounts.owner_email` (the account, written at
// signup) and `store_users` (access, one row per person). They are written at different moments by
// different code paths, so they can drift — and when they did, the effect was total and invisible:
// whoami consulted only store_users, said "no store", and sent the owner to the signup wizard; the
// wizard asked /api/store/onboarding, which consults BOTH, found her account and refused to make a
// second one. She circled a signup flow for a shop she already owned and could not reach it.
//
// Pure, so the rule the two paths must share can be stated once and tested.

export type IdentityInputs = {
 /** From store_users — access. */
 accessSlug: string | null | undefined;
 /** From store_accounts.owner_email — the account itself. */
 accountSlug: string | null | undefined;
};

export type Identity =
 | { kind: "store"; slug: string; repair: boolean }
 | { kind: "onboard" };

/**
 * Owning the account is enough. `repair` marks the case where only the account knew her — the
 * missing access row should be written back, because she owns the shop either way and the next
 * request would otherwise ask the same question and get the same wrong answer.
 */
export function resolveIdentity(i: IdentityInputs): Identity {
 const access = (i.accessSlug || "").trim();
 if (access) return { kind: "store", slug: access, repair: false };
 const account = (i.accountSlug || "").trim();
 if (account) return { kind: "store", slug: account, repair: true };
 return { kind: "onboard" };
}
