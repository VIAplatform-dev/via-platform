// Who gets to see the signup wizard, and who is sent past it.
//
// Pure and separate because this decision has been wrong twice. Once when it demanded a `?again=1`
// URL flag that nobody would guess, so VYA's own people typed the obvious address and were bounced
// to Home. Once when /api/infrastructure/whoami forgot to put `staff` on one of its five answers,
// so the same people came back looking like ordinary sellers on that one path. Both were invisible
// in review and obvious in use; a table of cases is how they stop happening.
//
// THE RULE, in the owner's words: VYA's own people can walk this flow as many times as they like.
// Everyone else is sent to their workspace once they have a store.

export type Whoami = {
  admin?: boolean;
  staff?: boolean;
  slug?: string | null;
  needsOnboarding?: boolean;
} | null | undefined;

export type GateDecision =
  /** Nobody is signed in — the wizard needs an identity to attach a store to. */
  | { go: "sign-in" }
  /** Show the wizard. `again` means they already have a store, so this run makes an extra one. */
  | { go: "wizard"; again: boolean }
  /** They have a shop and aren't staff: their destination is the workspace. */
  | { go: "home" };

export function onboardingGate(me: Whoami): GateDecision {
  // Not signed in at all. `needsOnboarding` counts as signed in — it is what whoami says about
  // somebody with a session and no store yet, which is precisely who this wizard is for.
  if (!me || (!me.needsOnboarding && !me.slug && me.admin !== true)) return { go: "sign-in" };

  // VYA's own people always stay. `admin` is the admin cookie; `staff` is one of our own addresses
  // signed in as a seller — either is enough, and neither requires a flag in the URL.
  if (me.admin === true || me.staff === true) {
    return { go: "wizard", again: Boolean(me.admin === true || me.slug) };
  }

  // A seller who already has a shop has finished this flow.
  if (me.slug) return { go: "home" };

  return { go: "wizard", again: false };
}
