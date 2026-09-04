// Reading /api/store/billing's `current` block without printing a null at her.
//
// An unbilled store comes back with tier, interval and status ALL null and the real answer in
// `plan` ("free"). Rendering `tier` straight through produced a burgundy card with a heading and
// nothing under it — which reads as a broken screen rather than as "you are on the free plan".

export type CurrentPlan = {
  tier: string | null;
  plan: string | null;
  interval: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
};

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Always a name. `tier` when there is one, else `plan`, else Free — never an empty string. */
export function planLabel(c: CurrentPlan): string {
  const raw = (c.tier ?? c.plan ?? "").trim();
  if (!raw || raw.toLowerCase() === "free") return "Free";
  return title(raw);
}

/**
 * "Billed monthly · renews 1 Oct 2026", or null when there is nothing to bill.
 *
 * Null rather than "Billed —": a free plan has no billing line, and a line that trails off is
 * worse than no line.
 */
export function billingLine(c: CurrentPlan): string | null {
  if (!c.interval) return null;
  const every = c.interval === "month" ? "monthly" : c.interval === "year" ? "yearly" : c.interval;
  const base = `Billed ${every}`;
  if (!c.currentPeriodEnd) return base;
  const d = new Date(c.currentPeriodEnd);
  if (isNaN(d.getTime())) return base;
  // Day-month-year, spelled short: this store is in the US but the plan dates read the same either
  // way at a glance, and "1 Oct 2026" cannot be misread as a month/day swap.
  const when = `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
  return `${base} · renews ${when}`;
}
