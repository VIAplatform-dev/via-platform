// WHERE A STORE'S OWN MAIL GOES. One order of preference, in one place.
//
// WHAT WAS HAPPENING. A store's contact address had four possible homes and the code read whichever
// one each call site happened to know about:
//
//   · `store_profiles.supportEmail` — the box the seller fills in under Settings → Store details,
//     and the only one she can change. NOTHING in the notification path read it.
//   · `storeContactEmails[slug]` — a hardcoded map in app/lib/stores.ts, written when the original
//     partner shops were onboarded. Every alert read this.
//   · the owner's sign-in address (store_users / store_accounts) — the only address a
//     self-onboarded store has at all. Nothing read it.
//   · OPS_ALERT_EMAIL — VYA's own inbox.
//
// So for every store that signed up through VYA rather than being added to that map by hand:
// offers and order alerts went to VYA's ops inbox instead of the seller, and buyer MESSAGES were
// sent nowhere at all — message-notify.ts only mailed `if (storeEmail)`, and there was no entry.
// A shopper wrote to a shop and nobody was told.
//
// THE ORDER, and why it is this way round:
//   1. reply-to        — she configured her sending identity; that is a deliberate answer.
//   2. supportEmail    — she typed it into the box labelled support contact.
//   3. curated map     — what VYA recorded for her at onboarding. Right until she says otherwise.
//   4. owner sign-in   — not chosen as a contact address, but certainly hers, and infinitely better
//                        than silence for a shop that never had the chance to set one.
//
// Ops is NOT in this list. A VYA address is not the store's contact address, and returning one here
// is how a seller's mail quietly became ours. Callers that genuinely want an ops fallback (VYA's own
// alerting) add it themselves and can see they are doing it.
//
// Pure — no database, no imports. store-contact-db does the reading.

export type ContactSource = "reply-to" | "support-email" | "curated" | "owner-login";

export type ContactCandidates = {
  /** The reply-to on her configured sending identity. */
  replyTo?: string | null;
  /** Settings → Store details → support contact. */
  supportEmail?: string | null;
  /** The hardcoded map from onboarding. */
  curated?: string | null;
  /** The address she signs in with (store_users owner, else the store_accounts owner). */
  ownerLogin?: string | null;
};

/** Addresses nothing can be delivered to, so they never win over a real one further down the list. */
const UNROUTABLE = /@(example\.(com|org|net)|test|localhost|invalid|noreply\.|no-reply\.)/i;

export function isDeliverable(email: string | null | undefined): boolean {
  const e = String(email ?? "").trim();
  if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return false;
  return !UNROUTABLE.test(e);
}

/**
 * The store's address, and which record it came from — or null when the store genuinely has none.
 *
 * The source is returned because "why did this go there" is the question asked whenever a seller
 * says she isn't getting her mail, and answering it should not need a debugger.
 */
export function pickStoreContact(c: ContactCandidates): { email: string; source: ContactSource } | null {
  const order: [ContactSource, string | null | undefined][] = [
    ["reply-to", c.replyTo],
    ["support-email", c.supportEmail],
    ["curated", c.curated],
    ["owner-login", c.ownerLogin],
  ];
  for (const [source, value] of order) {
    if (isDeliverable(value)) return { email: String(value).trim(), source };
  }
  return null;
}
