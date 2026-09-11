// What a shipping quote says, in the seller's terms rather than the carrier's.

export type LabelQuote = {
  rate: { provider: string; service: string; costCents: number; estDays: number | null; rateId: string };
  /** True when the label comes out of HER card — i.e. the buyer did not fund shipping at checkout. */
  sellerPays: boolean;
  buyerPaidCents: number;
  /** What VYA keeps when the buyer's flat tier covered more than the label actually cost. */
  marginCents: number;
  international: boolean;
  incoterm: string | null;
  customsWarnings?: { material: string; note: string }[];
};

const SYMBOLS: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };
function money(cents: number, currency: string): string {
  const code = (currency || "USD").toUpperCase();
  const symbol = SYMBOLS[code] ?? `${code} `;
  return `${symbol}${(Math.abs(cents) / 100).toFixed(2)}`;
}

/**
 * The sentence above the Buy button.
 *
 * WHO PAYS IS THE FIRST THING IT SAYS, because it is the only part that can cost her money she was
 * not expecting. On a free-shipping order the label is charged to her card, and a seller who taps
 * through a screen that led with "USPS Priority, 2 days" has been told the least important fact
 * first. When the buyer funded it, the same sentence is reassurance rather than a warning.
 */
export function labelQuoteLine(q: LabelQuote, currency: string): string {
  const cost = money(q.rate.costCents, currency);
  const days = q.rate.estDays ? `, about ${q.rate.estDays} ${q.rate.estDays === 1 ? "day" : "days"}` : "";
  const service = `${q.rate.provider} ${q.rate.service}`.trim();
  const who = q.sellerPays
    ? `${cost} — charged to your card, because shipping was free on this order.`
    : `${cost}, covered by the ${money(q.buyerPaidCents, currency)} the buyer paid for shipping.`;
  const abroad = q.international ? ` Going abroad${q.incoterm === "DDU" ? " — the buyer settles duty on delivery." : " with duty covered."}` : "";
  return `${who} ${service}${days}.${abroad}`;
}
