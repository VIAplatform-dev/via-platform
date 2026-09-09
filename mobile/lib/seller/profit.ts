// Profit on the phone — the same statement the web Home and P&L print (app/lib/analytics/
// profit-core.ts), read off /api/store/analytics/suite?sections=margin and formatted here. Pure.
//
// The server decides the arithmetic and the lines; this only decides how they read on a phone:
// whole units, a minus sign rather than a colour (a loss in green would be a lie), "(est.)" on
// the card-fee line because that number is inferred, and a plain sentence when nothing can be said
// because no sold piece carries a cost.

import { formatMoney } from "./home.ts";

export type ProfitLine = { label: string; cents: number; estimate?: boolean; total?: boolean };
export type MarginSection = { netProfitCents: number | null; profit?: { lines?: ProfitLine[]; missingCostNote?: string | null } | null };

export type ProfitRow = { key: string; label: string; amount: string; negative: boolean; total: boolean };

/** The statement as rows. Empty when profit is unknown — the screen prints the prompt instead. */
export function profitRows(margin: MarginSection | null | undefined, currency: string): ProfitRow[] {
  if (!margin || margin.netProfitCents === null || margin.netProfitCents === undefined) return [];
  const lines = margin.profit?.lines ?? [];
  return lines.map((l, i) => ({
    key: `${i}-${l.label}`,
    label: l.estimate ? `${l.label} (est.)` : l.label,
    amount: formatMoney(l.cents, currency),
    negative: l.cents < 0,
    total: l.total === true,
  }));
}

/** The one line for Home: "Net profit · 30d  £340", or null when there is nothing honest to say. */
export function netProfitLine(margin: MarginSection | null | undefined, currency: string): string | null {
  if (!margin || margin.netProfitCents === null || margin.netProfitCents === undefined) return null;
  return formatMoney(margin.netProfitCents, currency);
}

/** What to say when there is no net profit: why, and what to do about it. */
export function noProfitPrompt(margin: MarginSection | null | undefined): string {
  const note = margin?.profit?.missingCostNote;
  return note ? `No cost on record for what sold, so profit can't be worked out. ${note}` : "No cost on record for what sold, so profit can't be worked out. Add what you paid on each piece.";
}
