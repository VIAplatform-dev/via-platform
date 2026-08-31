// How long a seller's money waits in their own Stripe balance before Stripe pays it to their bank.
//
// THE PROBLEM. Every sale on a hosted storefront is a DIRECT charge on the seller's connected
// account — the seller is merchant of record, and the money is theirs from the moment the card
// clears (see payments-config.ts). Stripe's default schedule then pays it out to their bank on a
// rolling basis, within a couple of days. A refund, though, is drawn from that same balance: a
// buyer returning on day 10 of a 14-day policy is refunded out of money that left for the seller's
// bank on day 2. Stripe covers the difference by debiting their bank account or leaving the
// connected account negative — and a negative connected account is a problem the PLATFORM
// eventually eats.
//
// THE FIX, and what it deliberately is not. The payout SCHEDULE waits out the return window, so the
// funds are still sitting in the seller's Stripe balance for as long as a buyer can still send the
// piece back. Nothing about who owns the money changes: it is the seller's balance, the seller is
// still merchant of record, and VYA's cut is still the same application fee. We are not holding
// their money — Stripe is simply not moving it to their bank yet. (Consignment is the one case
// where VYA really does hold funds; that is a separate mechanism, see consignorCutToHold.)
//
// THE WINDOW IS THE STORE'S OWN. A store that promises 30-day returns needs a 30-day hold; one that
// sells final-sale needs none and should be paid as fast as Stripe allows. Both facts are already
// in `store_policies`, so the schedule is derived from the seller's own policy rather than being a
// number we impose — and re-derived whenever they edit that policy (see syncPayoutSchedule).
//
// Pure, except for the one clearly-marked function at the bottom that talks to Stripe.
import type { RefundPolicy } from "./store-policy-db.ts";

/** Stripe will not delay a payout beyond this. A store whose policy runs longer is clamped here and
 *  told about it — see payoutScheduleNotice. */
export const STRIPE_MAX_DELAY_DAYS = 30;

/** The return still has to travel back after a buyer starts it on the last day of the window, so the
 *  hold covers the window plus the journey. */
export const RETURN_SHIPPING_BUFFER_DAYS = 3;

/** What a store gets when it has no stated window — the same default `getRefundPolicy` hands out. */
export const DEFAULT_RETURN_WINDOW_DAYS = 14;

export type PayoutSchedule = {
 /** What to send Stripe as `settings[payouts][schedule][delay_days]`. "minimum" is Stripe's own
  *  keyword for the fastest its account's country allows. */
 delayDays: number | "minimum";
 /** The return window this was derived from, in the store's own terms. */
 windowDays: number;
 /** True only when the store's WINDOW itself is longer than Stripe will hold — i.e. there are days
  *  on which a buyer may still return a piece whose money has already left. Losing part of the
  *  shipping buffer doesn't count: the promise made to the buyer is still covered. */
 clamped: boolean;
};

/** The payout schedule a store's returns policy calls for. */
export function payoutScheduleFor(policy: RefundPolicy | null): PayoutSchedule {
 // Final sale: nothing can come back, so there is nothing to hold the money against.
 if (policy && policy.refundsEnabled === false) {
  return { delayDays: "minimum", windowDays: 0, clamped: false };
 }
 // A missing policy, or "returns at our discretion" (window 0), both mean the store accepts returns
 // without naming a deadline. Paying out immediately on such a store is the one outcome that is
 // certainly wrong, so they get the same default window the policy table itself hands out.
 const stated = Math.round(policy?.returnWindowDays ?? DEFAULT_RETURN_WINDOW_DAYS);
 const windowDays = stated > 0 ? stated : DEFAULT_RETURN_WINDOW_DAYS;
 const wanted = windowDays + RETURN_SHIPPING_BUFFER_DAYS;
 return {
  delayDays: Math.min(wanted, STRIPE_MAX_DELAY_DAYS),
  windowDays,
  clamped: windowDays > STRIPE_MAX_DELAY_DAYS,
 };
}

/**
 * What to tell the seller when their policy outlives what Stripe will hold — null when there is
 * nothing to say.
 *
 * Said plainly, in their own numbers, because the gap is real: they promised buyers 60 days and
 * their payouts can only wait 30, so a return in the last month comes out of a balance that may be
 * empty. Silently clamping would leave them believing they were covered.
 */
export function payoutScheduleNotice(s: PayoutSchedule): string | null {
 if (!s.clamped) return null;
 return `Your returns policy gives buyers ${s.windowDays} days, but Stripe can only hold a payout for ${STRIPE_MAX_DELAY_DAYS}. `
  + `After day ${STRIPE_MAX_DELAY_DAYS}, a refund comes out of whatever is in your Stripe balance at the time — `
  + `keep a buffer there, or shorten the window to ${STRIPE_MAX_DELAY_DAYS - RETURN_SHIPPING_BUFFER_DAYS} days.`;
}

/** The Stripe Accounts-API shape for a schedule. `interval: daily` is Stripe's rolling schedule —
 *  the delay is what does the work, not the cadence. */
export function stripeScheduleParams(s: PayoutSchedule): Record<string, unknown> {
 return { settings: { payouts: { schedule: { interval: "daily", delay_days: s.delayDays } } } };
}

// ── Applying it to the seller's Stripe account ──────────────────────────────────────────────────

/**
 * Put the store's current returns policy onto its connected account's payout schedule.
 *
 * Called at onboarding AND whenever the store edits its policy — a seller who moves from 14 days to
 * 30 and keeps a 17-day hold is back to refunding out of an empty balance, which is the whole thing
 * this exists to prevent. Idempotent: it writes the same schedule every time until the policy moves.
 *
 * Best-effort by contract. A store with no connected account has nothing to schedule, and a Stripe
 * outage must never be the reason a seller can't save their own returns policy — the caller keeps
 * going and the next policy save (or their next visit to the payments tab) puts it right.
 */
export async function syncPayoutSchedule(storeSlug: string): Promise<PayoutSchedule | null> {
 // Imported here rather than at the top so the rules above stay importable — by tests, and by the
 // payments route that only wants to DISPLAY the schedule — without dragging in the database and
 // Stripe clients.
 const [{ getSellerPayments }, { getRefundPolicy }, { stripePost, stripeConfigured }] = await Promise.all([
  import("./seller-payments-db.ts"),
  import("./store-policy-db.ts"),
  import("./stripe.ts"),
 ]);
 if (!stripeConfigured()) return null;
 const pay = await getSellerPayments(storeSlug).catch(() => null);
 if (!pay?.stripeAccountId) return null;
 const schedule = payoutScheduleFor(await getRefundPolicy(storeSlug).catch(() => null));
 try {
  await stripePost(`accounts/${pay.stripeAccountId}`, stripeScheduleParams(schedule));
 } catch {
  return null; // see above: never the reason a policy save fails
 }
 return schedule;
}
