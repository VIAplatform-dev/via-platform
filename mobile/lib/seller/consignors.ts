// The small decisions the Consignors screen makes, kept out of the screen so they can be tested.

/** What each payout method is called to a seller. The server stores the snake_case key. */
export const PAYOUT_METHOD_LABELS: Record<string, string> = {
  store_credit: "Store credit",
  cash: "Cash",
  check: "Check",
  stripe: "Direct deposit",
};

/**
 * Every method a store CAN offer, in the web's order.
 *
 * The phone only ever showed what the store had already switched on, and a store that has never
 * opened the web settings page is on the table default: store_credit, and nothing else. So the
 * phone looked broken ("I can only pay by store credit") when in truth nothing had been enabled,
 * and the page that enables them was web-only. These are the switches, on the phone.
 *
 * Mirrors app/infrastructure/admin/consignment/settings/page.tsx.
 */
export const ALL_PAYOUT_METHODS: { key: string; label: string; hint: string }[] = [
  { key: "stripe", label: "Direct deposit", hint: "Straight to their bank, via Stripe" },
  { key: "store_credit", label: "Store credit", hint: "Spend it with you" },
  { key: "cash", label: "Cash", hint: "Out of the till" },
  { key: "check", label: "Check", hint: "Posted to them" },
];

/**
 * Turning one on or off, with the one rule that must hold: a store always offers at least one way
 * to pay. Switching off the last method would leave a consignor owed money and no way to settle
 * it, so the last one on cannot be turned off.
 */
export function toggleMethod(current: string[] | null | undefined, key: string): string[] {
  const list = Array.isArray(current) && current.length ? [...current] : ["store_credit"];
  if (list.includes(key)) {
    if (list.length === 1) return list; // never leave a store with no way to pay
    return list.filter((k) => k !== key);
  }
  // Keep the canonical order rather than append order, so the chips don't shuffle as she taps.
  const order = ALL_PAYOUT_METHODS.map((m) => m.key);
  return [...list, key].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/**
 * The methods this store actually offers, as chips.
 *
 * Whatever the store's config says, anything unrecognised is still shown rather than dropped: a
 * method the phone has not been taught about is one a seller has deliberately turned on, and
 * silently hiding it would make her consignor look unpaid. It gets its raw key tidied into words.
 */
export function payoutMethodOptions(methods: string[] | null | undefined): { key: string; label: string }[] {
  const list = Array.isArray(methods) && methods.length ? methods : ["store_credit"];
  return list.map((key) => ({ key, label: PAYOUT_METHOD_LABELS[key] ?? key.replace(/_/g, " ") }));
}

/**
 * Their cut, as a number the API will take, or null for "use the store default".
 *
 * Blank is null, not 0: a consignor on 0% keeps nothing, which is a real (if unkind) arrangement,
 * and it must not be what an empty box quietly means. Out-of-range values are clamped rather than
 * refused, because the field only accepts digits and the only way to reach 500 is a typo.
 */
export function splitPctFromText(v: string | null | undefined): number | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const n = Number(t.replace(/[^0-9]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** The second line under a consignor's name: their cut, how they're paid, and whether they're on. */
export function describeConsignor(c: {
  defaultSplitPct?: number | null;
  payoutMethod?: string | null;
  status?: string | null;
}): string {
  const bits: string[] = [];
  if (c.defaultSplitPct != null) bits.push(`${c.defaultSplitPct}%`);
  if (c.payoutMethod) bits.push(PAYOUT_METHOD_LABELS[c.payoutMethod] ?? c.payoutMethod.replace(/_/g, " "));
  // Only ever said when it is NOT the ordinary case. A line that reads "Active" on every row is
  // one the eye stops seeing, and then the one inactive consignor reads as active too.
  if (c.status && c.status !== "active") bits.push(c.status);
  return bits.join(" · ") || "No cut set";
}
