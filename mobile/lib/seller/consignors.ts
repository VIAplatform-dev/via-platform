// The small decisions the Consignors screen makes, kept out of the screen so they can be tested.

/** What each payout method is called to a seller. The server stores the snake_case key. */
export const PAYOUT_METHOD_LABELS: Record<string, string> = {
  store_credit: "Store credit",
  cash: "Cash",
  check: "Check",
  stripe: "Bank transfer",
};

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
 * Their cut, as a number the API will take — or null for "use the store default".
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
  // Only ever said when it is NOT the ordinary case — a line that reads "Active" on every row is
  // one the eye stops seeing, and then the one inactive consignor reads as active too.
  if (c.status && c.status !== "active") bits.push(c.status);
  return bits.join(" · ") || "No cut set";
}
