// Which pushes and emails a store wants.
//
// The defaults mirror the phone's Notifications screen (mobile/app/(seller)/notifications.tsx):
// a piece sold and a buyer message ON, everything else opt-in. A phone that buzzes for nothing
// gets silenced, and then the two that matter are lost with it. Pure; the table is in
// notification-prefs-db.ts.

export const PUSH_EVENTS = ["sold", "message", "offer", "payout"] as const;
export const EMAIL_EVENTS = ["daily", "weekly", "needs"] as const;
export type PushEvent = (typeof PUSH_EVENTS)[number];
export type EmailEvent = (typeof EMAIL_EVENTS)[number];

export type NotificationPrefs = {
 push: Record<PushEvent, boolean>;
 email: Record<EmailEvent, boolean>;
};

/** What a PUT sends: only the keys being changed. */
export type NotificationPrefsPatch = { push?: Partial<Record<PushEvent, boolean>>; email?: Partial<Record<EmailEvent, boolean>> };

/** What each toggle is called — the phone's Notifications screen uses the same words. */
export const PUSH_LABELS: Record<PushEvent, string> = { sold: "A piece sells", message: "A buyer messages", offer: "An offer comes in", payout: "A payout lands" };
export const EMAIL_LABELS: Record<EmailEvent, string> = { daily: "Daily summary", weekly: "Weekly numbers", needs: "Something needs you" };

export const DEFAULT_PREFS: NotificationPrefs = {
 push: { sold: true, message: true, offer: true, payout: false },
 email: { daily: false, weekly: true, needs: true },
};

function pick<K extends string>(keys: readonly K[], base: Record<K, boolean>, raw: unknown): Record<K, boolean> {
 const out = { ...base };
 if (raw && typeof raw === "object") {
  const src = raw as Record<string, unknown>;
  for (const k of keys) if (typeof src[k] === "boolean") out[k] = src[k] as boolean;
 }
 return out;
}

/** Whatever was stored (or nothing) → a complete, fresh prefs object over the defaults. */
export function normalizePrefs(raw: unknown): NotificationPrefs {
 const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
 return { push: pick(PUSH_EVENTS, DEFAULT_PREFS.push, src.push), email: pick(EMAIL_EVENTS, DEFAULT_PREFS.email, src.email) };
}

/** Apply a patch: only the named keys change, unknown keys are ignored. */
export function mergePrefs(current: NotificationPrefs, patch: NotificationPrefsPatch): NotificationPrefs {
 return { push: pick(PUSH_EVENTS, current.push, patch?.push), email: pick(EMAIL_EVENTS, current.email, patch?.email) };
}

/** The gate every push sender asks before it sends. */
export function pushEnabled(prefs: NotificationPrefs, ev: PushEvent): boolean {
 return prefs.push[ev] === true;
}
