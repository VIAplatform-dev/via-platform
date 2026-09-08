// The Notifications screen's rows, and the PUT it sends. Mirrors app/lib/notification-prefs-core.ts.
//
// One toggle is one key: the patch names only what changed, the server merges it. That is what
// makes the optimistic flip safe — reverting is re-applying the old value, and a change made on
// another device in the meantime is never overwritten by six keys this phone did not touch.

export type PushKey = "sold" | "message" | "offer" | "payout";
export type EmailKey = "daily" | "weekly" | "needs";
export type Prefs = { push: Record<PushKey, boolean>; email: Record<EmailKey, boolean> };
export type PrefsPatch = { push?: Partial<Record<PushKey, boolean>>; email?: Partial<Record<EmailKey, boolean>> };

export const PREF_ROWS: ReadonlyArray<{ group: "push"; key: PushKey; label: string } | { group: "email"; key: EmailKey; label: string }> = [
  { group: "push", key: "sold", label: "A piece sells" },
  { group: "push", key: "message", label: "A buyer messages" },
  { group: "push", key: "offer", label: "An offer comes in" },
  { group: "push", key: "payout", label: "A payout lands" },
  { group: "email", key: "daily", label: "Daily summary" },
  { group: "email", key: "weekly", label: "Weekly numbers" },
  { group: "email", key: "needs", label: "Something needs you" },
];

// Sales and messages default ON; everything else opts in.
export const DEFAULT_PREFS: Prefs = {
  push: { sold: true, message: true, offer: true, payout: false },
  email: { daily: false, weekly: true, needs: true },
};

function pick<K extends string>(base: Record<K, boolean>, raw: unknown): Record<K, boolean> {
  const out = { ...base };
  if (raw && typeof raw === "object") {
    const src = raw as Record<string, unknown>;
    for (const k of Object.keys(base) as K[]) if (typeof src[k] === "boolean") out[k] = src[k] as boolean;
  }
  return out;
}

/** Whatever the server sent → a complete prefs object over the defaults. */
export function normalizePrefs(raw: unknown): Prefs {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { push: pick(DEFAULT_PREFS.push, src.push), email: pick(DEFAULT_PREFS.email, src.email) };
}

/** The patch a tap on one row sends. */
export function toggled(prefs: Prefs, group: "push" | "email", key: string): PrefsPatch {
  if (group === "push") return { push: { [key]: !prefs.push[key as PushKey] } };
  return { email: { [key]: !prefs.email[key as EmailKey] } };
}

/** A patch applied locally — the optimistic state, and the revert when the PUT fails. */
export function applyPatch(prefs: Prefs, patch: PrefsPatch): Prefs {
  return { push: pick(prefs.push, patch.push), email: pick(prefs.email, patch.email) };
}
