// The rental price ladder. Pure, and in its own file so it can be tested: the panel it used to live
// in is a .tsx, which the test runner cannot load at all.

export type Tier = { days: number; cents: number };

export const STARTER: Tier[] = [{ days: 4, cents: 0 }, { days: 7, cents: 0 }, { days: 28, cents: 0 }];

export function starterTiers(priceCents: number | null | undefined): Tier[] {
 const p = Math.round(Number(priceCents) || 0);
 if (p <= 0) return STARTER;
 const at = (pct: number) => Math.max(100, Math.round((p * pct) / 100 / 100) * 100); // to the nearest pound/dollar, never zero
 return [{ days: 4, cents: at(15) }, { days: 7, cents: at(20) }, { days: 28, cents: at(40) }];
}
