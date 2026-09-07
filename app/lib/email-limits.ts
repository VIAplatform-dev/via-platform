// ───────────────────────────────────────────────────────────────────────────
// What each plan can send.
//
// The line is NOT "marketing vs transactional" and not cost. Sending is cheap — a few hundredths of
// a cent an email — so nobody is being metered because email is expensive.
//
// The line is **who chose to send it**:
//
//   AUTOMATIC — an order confirmation, a shipping notice, an abandoned basket, a new-arrivals
//   digest. Each fires because a SHOPPER did something, to someone who just interacted with the
//   shop. Low complaint risk, high value, and the thing that makes a small shop work at all.
//   Every plan gets these, including free.
//
//   CAMPAIGNS — a shop composes something and sends it to her whole list at once. This is the one
//   with real risk attached: it goes to people who didn't just ask for anything, and complaints
//   land on VYA's sending domain, where they degrade delivery for every other store. Metered by
//   plan — not to ration a cheap resource, but because a store paying monthly is a store we have a
//   relationship with, and that relationship is the actual protection.
//
// Numbers live here so changing them is a one-line edit rather than a search.
// ───────────────────────────────────────────────────────────────────────────

import type { TierId } from "./plans";

/** Campaigns a store may send per calendar month. null = no limit. 0 = not on this plan. */
export const CAMPAIGNS_PER_MONTH: Record<TierId, number | null> = {
 starter: 0,
 // One a week. A resale shop's rhythm is the weekly drop, and a store that can't announce its own
 // drop will announce it somewhere else — taking its list, and its numbers, with it.
 studio: 4,
 atelier: null,
};

/** A store with no live plan — free, or a lapsed subscription. */
export const FREE_CAMPAIGNS_PER_MONTH = 0;

export function campaignAllowance(tier: TierId | null | undefined): number | null {
 if (!tier) return FREE_CAMPAIGNS_PER_MONTH;
 const n = CAMPAIGNS_PER_MONTH[tier];
 return n === undefined ? FREE_CAMPAIGNS_PER_MONTH : n;
}

export type SendVerdict =
 | { ok: true; remaining: number | null }
 | { ok: false; reason: string; upgrade: boolean };

/**
 * May this store send a campaign right now?
 *
 * `sentThisMonth` is counted by the caller from what actually went out, so a store can't get extra
 * sends by deleting drafts.
 */
export function maySendCampaign(tier: TierId | null | undefined, sentThisMonth: number): SendVerdict {
 const allowance = campaignAllowance(tier);
 if (allowance === null) return { ok: true, remaining: null };
 if (allowance === 0) {
  return {
   ok: false,
   upgrade: true,
   // Says what she CAN do, not only what she can't — a store on Starter is still sending the emails
   // that make her money, and shouldn't read this as "email is off".
   reason: "Sending a campaign to your whole list is on Studio and Pro. Your order emails, abandoned baskets and new-arrivals emails keep sending on every plan.",
  };
 }
 if (sentThisMonth >= allowance) {
  return {
   ok: false,
   upgrade: true,
   reason: `You've sent your ${allowance} campaigns for this month. The next one can go out on the 1st, or move up a plan to send more.`,
  };
 }
 return { ok: true, remaining: allowance - sentThisMonth };
}

/** One line for the composer, so the limit is visible before she writes rather than after. */
export function allowanceLabel(tier: TierId | null | undefined, sentThisMonth: number): string {
 const allowance = campaignAllowance(tier);
 if (allowance === null) return "Unlimited campaigns on your plan.";
 if (allowance === 0) return "Campaigns are on Studio and Pro. Your automatic emails send on every plan.";
 const left = Math.max(0, allowance - sentThisMonth);
 return left === 0
  ? `No campaigns left this month (${allowance} of ${allowance} sent).`
  : `${left} of ${allowance} campaigns left this month.`;
}

/** The window a month's sends are counted in. First of the month, in the store's own reckoning. */
export function monthStart(now = new Date()): Date {
 return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
