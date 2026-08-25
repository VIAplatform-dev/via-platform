// ───────────────────────────────────────────────────────────────────────────
// One field style for every form on a storefront.
//
// There were five: the contact form, the newsletter, the ask-about-this-item box, and two editor
// previews, each with its own hardcoded `border-black/20 bg-white/70`. On a cream template that
// reads as a white box pasted onto the page; on a dark one it is worse. And because none of them
// used the corner token, a store set to soft corners still drew square inputs next to its rounded
// buttons — which is exactly how it looked on Corner Shop.
//
// Two rules make a field belong to the page it is on:
//   · colour comes from `currentColor`, so the field inherits the storefront's ink and ground
//   · corners come from `vya-field`, the same token that drives `.vya-cta` and `.vya-img`
//
// The submit button uses `vya-cta` for the same reason, and is full width so it lines up with the
// fields above it rather than floating at its own size.
// ───────────────────────────────────────────────────────────────────────────

export const FIELD =
 "vya-field w-full border border-current/20 bg-current/[0.03] px-4 py-2.5 text-sm outline-none transition placeholder:opacity-50 focus:border-current/45";

/** Tighter, for the compact forms that sit inside a product card or a sidebar. */
export const FIELD_SM =
 "vya-field w-full border border-current/20 bg-current/[0.03] px-3 py-2 text-[13px] outline-none transition placeholder:opacity-50 focus:border-current/45";

/** Full width so it reads as the end of the form rather than a stray button beside it. */
export const SUBMIT =
 "vya-cta mt-1 w-full px-8 py-3 text-[11px] uppercase tracking-[0.18em] text-white transition hover:opacity-90 disabled:opacity-50";

export const SUBMIT_SM =
 "vya-cta w-full px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-white transition hover:opacity-90 disabled:opacity-50";
