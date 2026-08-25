import { cn } from "./ui";

// Where a price sits on the low→high resale range, with the AI's own recommendation marked.
//
// Lifted out of add-listing so the BULK draft editor can show the same guidance. Bulk kept only
// `suggestedCents` from the estimate and dropped the band and the reasoning on the floor, so a
// seller editing forty drafts saw a bare number with nothing behind it, while the same item added
// one at a time explained itself.
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
