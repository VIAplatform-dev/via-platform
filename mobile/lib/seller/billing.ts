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

export type Tier = {
  id: string;
  name: string;
  tagline?: string | null;
  priced: boolean;
  price?: { month?: { amount: number; currency: string } | null; year?: { amount: number; currency: string } | null };
  features?: string[];
  newFeatures?: string[];
};

/**
 * "$29/mo" — the price on a tier card, in the currency Stripe actually quoted.
 *
 * Whole units on purpose: these are round numbers by design, and "$29.00/mo" reads as a bill rather
 * than a price. A tier with no price for the chosen interval says so rather than rendering "$0" —
 * yearly is often not configured, and a free-looking Atelier plan is the worst possible bug here.
 */
export function tierPriceLine(t: Tier, interval: "month" | "year"): string {
  const p = t.price?.[interval];
  if (!p || typeof p.amount !== "number") return interval === "year" ? "Monthly only" : "—";
  const symbol = { USD: "$", GBP: "£", EUR: "€" }[(p.currency || "USD").toUpperCase()] ?? `${(p.currency || "").toUpperCase()} `;
  return `${symbol}${Math.round(p.amount / 100)}${interval === "year" ? "/yr" : "/mo"}`;
}

export type Invoice = {
  id: string;
  number: string | null;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string | null;
  pdfUrl: string | null;
};

const MONEY: Record<string, string> = { USD: "$", GBP: "£", EUR: "€" };

/**
 * "1 Oct 2026 · $29.00" — an invoice row's left side.
 *
 * Pennies here, unlike a plan price: this is a statement of what left her account, and rounding
 * money she was actually charged is how a seller ends up reconciling against a number we invented.
 */
export function invoiceLine(i: Invoice): string {
  const symbol = MONEY[(i.currency || "USD").toUpperCase()] ?? `${(i.currency || "").toUpperCase()} `;
  const amount = `${symbol}${(i.amountCents / 100).toFixed(2)}`;
  if (!i.createdAt) return amount;
  const d = new Date(i.createdAt);
  if (isNaN(d.getTime())) return amount;
  const when = `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
  return `${when} · ${amount}`;
}

/**
 * What to say about an invoice's state — or null when it is the ordinary one.
 *
 * A list where every row says "Paid" teaches the eye to skip the word, and then the unpaid one is
 * skipped too. Only the exceptions speak.
 */
export function invoiceStatusNote(i: Invoice): string | null {
  const s = (i.status || "").toLowerCase();
  if (s === "paid") return null;
  if (s === "open") return "Unpaid";
  if (s === "draft") return "Not issued yet";
  if (s === "void") return "Voided";
  if (s === "uncollectible") return "Written off";
  return s;
}
