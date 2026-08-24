"use client";

// ─────────────────────────────────────────────────────────────────────────────
// The AI pricing guidance block — the rationale sentence, the quick-sale→top-demand
// scale, and the over/under-market flag.
//
// Extracted from the one-at-a-time add-listing page so the DRAFTS editor can show the same
// thing. Bulk-imported listings used to open a bare price box with none of this, even though
// the pricing run had produced all of it — the numbers were simply thrown away after the draft
// was saved. One component, so the two surfaces can't drift apart.
// ─────────────────────────────────────────────────────────────────────────────

export type Flag = { level: string; message: string; marketUsd: number; pct?: number };

/** Client mirror of the server's computePriceFlag (whole dollars) — lets the flag update
 *  instantly as the seller edits the price, with no server round-trip. */
export function flagFor(priceUsd: number, marketUsd: number | null, lowUsd: number | null, highUsd: number | null): Flag | null {
 if (!marketUsd || priceUsd <= 0) return null;
 const lo = lowUsd ?? Math.round(marketUsd * 0.85);
 const hi = highUsd ?? Math.round(marketUsd * 1.2);
 const pct = Math.round(((priceUsd - marketUsd) / marketUsd) * 100);
 if (priceUsd < lo) return { level: "under", pct, marketUsd, message: `About ${Math.abs(pct)}% below market — comparable pieces sit around $${marketUsd}. You could likely price higher.` };
 if (priceUsd > hi) return { level: "over", pct, marketUsd, message: `About ${pct}% above market (~$${marketUsd}) — expect a slower sale.` };
 return { level: "at", pct, marketUsd, message: `Right at market (~$${marketUsd}).` };
}

function cn(...xs: (string | false | null | undefined)[]) { return xs.filter(Boolean).join(" "); }

/** Google-Flights-style price scale: where the seller's price sits on the low→high resale
 *  range, with the AI's recommendation marked. */
export function PriceScale({ low, high, market, value }: { low: number; high: number; market: number | null; value: number }) {
 const span = Math.max(1, high - low);
 const pos = (v: number) => `${Math.max(0, Math.min(1, (v - low) / span)) * 100}%`;
 const mid = market ?? (low + high) / 2;
 const verdict = value <= 0 ? null
 : value < low * 0.98 ? { t: "Below market", c: "text-amber-600" }
 : value > high * 1.02 ? { t: "Above market", c: "text-red-600" }
 : market && Math.abs(value - market) / market < 0.06 ? { t: "Market rate", c: "text-emerald-600" }
 : value < mid ? { t: "Good value", c: "text-emerald-600" }
 : { t: "Premium", c: "text-stone-600" };
 return (
 <div className="mt-2">
 <div className="relative h-2 rounded-full" style={{ background: "linear-gradient(90deg,#10b98155,#f59e0b55,#ef444455)" }}>
  {market != null && <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-stone-900 shadow" style={{ left: pos(market) }} title={`AI rec $${market.toLocaleString()}`} />}
  {value > 0 && <div className="absolute -top-1 h-4 w-[3px] -translate-x-1/2 rounded bg-[var(--accent,#0e9f76)]" style={{ left: pos(value) }} title={`Your price $${value.toLocaleString()}`} />}
 </div>
 <div className="mt-1.5 flex items-center justify-between text-[10px] text-stone-400">
  <span>${low.toLocaleString()} <span className="text-stone-300">quick sale</span></span>
  {verdict && <span className={cn("font-semibold", verdict.c)}>{verdict.t}</span>}
  <span>${high.toLocaleString()} <span className="text-stone-300">top demand</span></span>
 </div>
 </div>
 );
}

/** The over/under-market banner. */
export function PriceFlagBanner({ flag }: { flag: Flag }) {
 return (
 <div className={cn(
  "mt-2 rounded-lg px-3 py-2 text-[11px] font-medium",
  flag.level === "under" ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
  : flag.level === "over" ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200"
  : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
 )}>
  {flag.level === "under" ? "🔽 " : flag.level === "over" ? "🔼 " : "✅ "}{flag.message}
 </div>
 );
}

export type PriceContext = {
 marketCents: number | null;
 lowCents: number | null;
 highCents: number | null;
 confidence: number | null;
 rationale: string | null;
 source: string | null;
};

/**
 * "Reprice for your margin" — the repair for costs entered AFTER the AI ran.
 *
 * estimatePrice applies the seller's cost floor at suggestion time, so a piece priced before its
 * cost was recorded keeps a number that can sit below what the seller paid. Nothing recomputed it;
 * the margin column just showed red. This does, from the values already on screen — no AI call, no
 * comp search, no spend, because the market read was stored with the suggestion.
 *
 *   floor = cost x (1 + markup)      new price = max(market, floor)
 *
 * When the floor lands ABOVE the market read it says so rather than quietly repricing. That
 * tension belongs to the seller — hiding it just moves the surprise to the piece not selling.
 */
export function RepriceForMargin({ priceUsd, costUsd, markupPct, marketUsd, onApply }: {
 priceUsd: number; costUsd: number | null; markupPct: number | null; marketUsd: number | null;
 onApply: (nextUsd: number) => void;
}) {
 if (!costUsd || costUsd <= 0 || markupPct == null) return null;
 const floor = Math.round(costUsd * (1 + markupPct / 100));
 const next = Math.max(marketUsd ?? 0, floor);
 if (priceUsd > 0 && priceUsd >= floor) return null; // the price already clears the floor
 const aboveMarket = marketUsd != null && floor > marketUsd;
 return (
  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5">
   <div className="flex items-center justify-between gap-3">
    <p className="text-[12px] leading-snug text-amber-900">
     {priceUsd > 0
      ? <>This price is below your cost plus {markupPct}% margin (<span className="tabular-nums font-semibold">${floor.toLocaleString()}</span>).</>
      : <>Your cost plus {markupPct}% margin is <span className="tabular-nums font-semibold">${floor.toLocaleString()}</span>.</>}
     {aboveMarket && <> The market read is <span className="tabular-nums">${marketUsd!.toLocaleString()}</span>, so this may sit longer.</>}
    </p>
    <button
     type="button"
     onClick={() => onApply(next)}
     className="shrink-0 rounded-lg bg-amber-900 px-3 py-1.5 text-[12px] font-semibold text-amber-50 transition hover:bg-amber-800"
    >Reprice to ${next.toLocaleString()}</button>
   </div>
  </div>
 );
}

/**
 * The whole block, for an editor that has a stored price context. Renders nothing when there is
 * no market value to anchor on, so a manually-created listing simply shows its plain price box.
 *
 * `lowConfidence` mirrors the add-listing behaviour: below ~0.35 the AI is guessing, and showing a
 * confident-looking scale would be worse than showing nothing.
 */
export function PriceGuidance({ ctx, priceUsd }: { ctx: PriceContext | null; priceUsd: number }) {
 const market = ctx?.marketCents ? Math.round(ctx.marketCents / 100) : null;
 if (!ctx || !market) return null;
 const low = ctx.lowCents ? Math.round(ctx.lowCents / 100) : Math.round(market * 0.85);
 const high = ctx.highCents ? Math.round(ctx.highCents / 100) : Math.round(market * 1.2);
 const lowConfidence = typeof ctx.confidence === "number" && ctx.confidence < 0.35;
 const flag = lowConfidence ? null : flagFor(priceUsd, market, low, high);
 return (
 <div>
  {ctx.rationale && <p className="mt-1 text-[10px] leading-relaxed text-stone-400">{ctx.rationale}</p>}
  {!lowConfidence && <PriceScale low={low} high={high} market={market} value={priceUsd} />}
  {lowConfidence && <p className="mt-2 text-[10px] text-stone-400">AI confidence is low on this one — treat the estimate as a starting point.</p>}
  {flag && <PriceFlagBanner flag={flag} />}
 </div>
 );
}
