// Renting a piece out, from the phone.
//
// A piece becomes rentable when terms exist for it and stops being rentable when they are deleted
// — that is the whole model (app/api/store/rentals/terms/[itemId]). The endpoint has always
// accepted the phone's token; the phone simply never called it, so renting was a thing you could
// only set up at a laptop, on pieces you had usually photographed with the phone.
//
// PRICES ARE IN WHOLE UNITS HERE AND CENTS ON THE WIRE. A seller types "45", not "4500", and the
// one place that conversion happens is this file.

export type Tier = { days: number; cents: number };

/** The three lengths VYA prices by default: a long weekend, a week, a month. */
export const TIER_DAYS = [4, 7, 28] as const;

export const tierLabel = (days: number): string =>
  days === 4 ? "4 days" : days === 7 ? "1 week" : days === 28 ? "4 weeks" : `${days} days`;

/**
 * Opening prices for a piece nobody has priced yet, from what it sells for.
 *
 * Mirrors starterTiers in app/infrastructure/admin/rentals/RentalPanel.tsx, proportions included:
 * a few days is a fraction of retail, a month is most of the way to it. A starting point to argue
 * with, not a recommendation — and never zero, because saving filters unpriced tiers out and an
 * all-zero ladder makes the toggle look broken.
 */
export function starterTiers(priceCents: number | null | undefined): Tier[] {
  const p = Math.round(Number(priceCents) || 0);
  if (p <= 0) return TIER_DAYS.map((days) => ({ days, cents: 0 }));
  const at = (pct: number) => Math.max(100, Math.round((p * pct) / 100 / 100) * 100);
  return [{ days: 4, cents: at(15) }, { days: 7, cents: at(20) }, { days: 28, cents: at(40) }];
}

/** What the seller sees in a box: whole units, blank when unpriced. */
export function tierToText(cents: number): string {
  return cents > 0 ? String(Math.round(cents / 100)) : "";
}

/** What she typed, back into cents. Digits only; blank means "not offered at this length". */
export function textToCents(v: string | null | undefined): number {
  const digits = String(v ?? "").replace(/[^0-9]/g, "");
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n * 100 : 0;
}

export type TermsForm = { prices: Record<number, string>; replacement: string };

export function formFromTiers(tiers: Tier[], replacementCents: number | null): TermsForm {
  const prices: Record<number, string> = {};
  for (const days of TIER_DAYS) {
    prices[days] = tierToText(tiers.find((t) => t.days === days)?.cents ?? 0);
  }
  return { prices, replacement: replacementCents ? String(Math.round(replacementCents / 100)) : "" };
}

/** The body the PUT wants: only priced lengths, because an unpriced one is not on offer. */
export function tiersFromForm(form: TermsForm): Tier[] {
  return TIER_DAYS
    .map((days) => ({ days, cents: textToCents(form.prices[days]) }))
    .filter((t) => t.cents > 0);
}

/**
 * Why this cannot be saved yet, or null.
 *
 * The route rejects an empty ladder with "At least one duration and price is needed", which is the
 * right rule and the wrong moment to learn it — so the same check runs here and the Save button
 * says it before she taps.
 */
export function termsProblem(form: TermsForm): string | null {
  if (tiersFromForm(form).length === 0) return "Give at least one length a price.";
  const replacement = textToCents(form.replacement);
  const cheapest = Math.min(...tiersFromForm(form).map((t) => t.cents));
  if (replacement > 0 && replacement < cheapest) {
    // Replacement value is what she collects if it never comes back. Below the rental price it is
    // cheaper to keep the piece than to return it, which is not a deal anybody means to offer.
    return "Replacement value should be more than the rental price.";
  }
  return null;
}

/** The request body for PUT /api/store/rentals/terms/[itemId]. */
export function termsPayload(form: TermsForm, alsoForSale: boolean): {
  tiers: Tier[]; replacementCents: number | null; fitsSizes: null; alsoForSale: boolean;
} {
  const replacement = textToCents(form.replacement);
  return {
    tiers: tiersFromForm(form),
    replacementCents: replacement > 0 ? replacement : null,
    fitsSizes: null,
    alsoForSale,
  };
}

/** The one-line summary under the toggle when it is on. */
export function termsSummary(form: TermsForm, currency: string): string | null {
  const tiers = tiersFromForm(form);
  if (tiers.length === 0) return null;
  const symbol = currency.toUpperCase() === "GBP" ? "£" : currency.toUpperCase() === "EUR" ? "€" : "$";
  return tiers.map((t) => `${tierLabel(t.days)} ${symbol}${Math.round(t.cents / 100)}`).join(" · ");
}
