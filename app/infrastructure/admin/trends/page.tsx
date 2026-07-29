"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Sparkles } from "lucide-react";
import { AdminPage, AdminHeader, TechCard, StatusPill, TechButton } from "../ui";

type Heat = { brand: string; rank: number; momentumPct: number | null; isBreakout: boolean; heat: number };
type Cat = { key: string; rank: number; momentumPct: number | null; isBreakout: boolean };
type YourBrand = { brand: string; rank: number; momentumPct: number | null; trending: boolean; note: string };
type GTrend = { brand: string; momentumPct: number | null; avgInterest: number; breakout: boolean };
type Resale = { brand: string; soldCount: number; medianPriceCents: number | null; webMedianCents: number | null; volMomentumPct: number | null; priceMomentumPct: number | null };
type IgBuzz = { brand: string; buzzScore: number; sampleCount: number; momentumPct: number | null };
type Play = { brand: string; action: "source" | "price" | "watch" | "cool"; reason: string; suggestedPriceCents: number | null; carried: boolean };
type Data = { rising: Heat[]; categories: Cat[]; yourBrands: YourBrand[]; googleTrends: GTrend[]; resaleMarket: Resale[]; igBuzz: IgBuzz[]; playbook: Play[]; webConfigured: boolean; socialConfigured: boolean; generatedAt: string };
type SourcePick = { segmentType: string; segmentValue: string; score: number; confidence: "high" | "medium"; trend: "rising" | "falling" | "flat"; reason: string };
type SourceNowData = { picks: SourcePick[]; asOfDate: string | null; empty?: boolean; locked?: boolean };
type DemandResult = { segmentType: string; segmentValue: string; demandIndex: number; hasPriceData: boolean; priceP25: number | null; priceMedian: number | null; priceP75: number | null; verdict: { rating: "source" | "buy-sharp" | "selective" | "pass"; headline: string; detail: string } };
type BuyVerdict = { rating: "source" | "buy-sharp" | "selective" | "pass"; headline: string; detail: string; basis?: string };
type BuyEbay = { medianPrice: number | null; p25: number | null; p75: number | null; activeCount: number | null; soldPer30d: number | null; priceMomentumPct: number | null };
type BuyGoogle = { momentumPct: number | null; avgInterest: number; breakout: boolean };
type CultureTrend = { keyword: string; growthWow: number | null };
type CultureData = { trends: CultureTrend[]; empty?: boolean; locked?: boolean };

const VERDICT_TONE: Record<DemandResult["verdict"]["rating"], "live" | "info" | "pending" | "neutral"> = {
 source: "live", "buy-sharp": "info", selective: "pending", pass: "neutral",
};
const vmoney = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);

const PLAY_STYLE: Record<Play["action"], { label: string; tone: "live" | "info" | "pending" | "neutral"; rail: string }> = {
 source: { label: "Source", tone: "live", rail: "bg-[var(--accent-bright,#2fd39b)]" },
 price: { label: "Price", tone: "info", rail: "bg-sky-400" },
 watch: { label: "Watch", tone: "pending", rail: "bg-amber-400" },
 cool: { label: "Ease off", tone: "neutral", rail: "bg-stone-300" },
};

// A compact "Google Search" momentum chip, shown alongside VYA demand.
function GChip({ pct, breakout }: { pct: number | null; breakout?: boolean }) {
 if (pct === null) return null;
 const up = pct >= 0;
 return (
 <span title="Google Search momentum (3-mo)">
 <StatusPill tone={breakout ? "pending" : up ? "info" : "neutral"} className="text-[10.5px]">
 <span className="font-mono text-[9px] font-bold">G</span>{up ? "+" : ""}{Math.round(pct)}%
 </StatusPill>
 </span>
 );
}

function Momentum({ pct, breakout }: { pct: number | null; breakout?: boolean }) {
 if (breakout) return <StatusPill tone="pending"><Sparkles size={11} /> Breakout</StatusPill>;
 if (pct === null) return <span className="text-[12px] text-stone-400">—</span>;
 const up = pct >= 0;
 return (
 <span className={`inline-flex items-center gap-0.5 text-[12px] font-medium tabular-nums ${up ? "text-[var(--accent-ink,#0b7a5c)]" : "text-stone-400"}`}>
 {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{up ? "+" : ""}{Math.round(pct)}%
 </span>
 );
}

export default function TrendsPage() {
 const [data, setData] = useState<Data | null>(null);
 const [sourceNow, setSourceNow] = useState<SourceNowData | null>(null);
 const [culture, setCulture] = useState<CultureData | null>(null);
 const [loading, setLoading] = useState(true);
 const [buyQ, setBuyQ] = useState("");
 const [buyResults, setBuyResults] = useState<DemandResult[] | null>(null);
 const [buyVerdict, setBuyVerdict] = useState<BuyVerdict | null>(null);
 const [buyEbay, setBuyEbay] = useState<BuyEbay | null>(null);
 const [buyGoogle, setBuyGoogle] = useState<BuyGoogle | null>(null);
 const [buyLoading, setBuyLoading] = useState(false);

 useEffect(() => {
 fetch("/api/store/trends").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setData(d); setLoading(false); }).catch(() => setLoading(false));
 // Source Now — from VYA's own marketplace data, so it works today (external signals are optional).
 fetch("/api/store/source-now?window=30d").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setSourceNow(d); }).catch(() => {});
 fetch("/api/store/culture-trends").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setCulture(d); }).catch(() => {});
 }, []);

 async function runDemandSearch(q: string) {
 if (q.trim().length < 2) { setBuyResults(null); setBuyVerdict(null); setBuyEbay(null); setBuyGoogle(null); return; }
 setBuyLoading(true);
 try {
 const r = await fetch(`/api/store/demand-search?q=${encodeURIComponent(q.trim())}&window=30d`);
 if (r.ok) { const d = await r.json(); setBuyResults(d.results ?? []); setBuyVerdict(d.verdict ?? null); setBuyEbay(d.ebay ?? null); setBuyGoogle(d.google ?? null); }
 } finally { setBuyLoading(false); }
 }

 return (
 <AdminPage>
 <AdminHeader
 eyebrow="Platform · Trends"
 title="Trends"
 subtitle="Your sourcing & pricing playbook — VYA demand, Google Search, and real eBay resale prices read together into clear calls. The signals behind each call are below."
 />

 {/* Source Now — the headline: what to buy right now, from VYA's own data (works before external signals are on). */}
 {sourceNow && sourceNow.picks.length > 0 && (
 <TechCard className="mb-6 p-5">
 <div className="mb-1 flex items-center justify-between">
 <p className="text-[13px] font-semibold text-stone-900">Source now</p>
 <span className="text-[11px] uppercase tracking-wide text-stone-400">Rising demand · thin supply</span>
 </div>
 <p className="mb-3 text-[12px] text-stone-400">What to buy right now — where VYA buyers&apos; demand is rising and few stores carry it. The window to source before prices climb.</p>
 <div className="space-y-2">
 {sourceNow.picks.map((p) => (
 <div key={`${p.segmentType}:${p.segmentValue}`} className="flex items-start gap-3 rounded-lg border border-stone-100 bg-white px-4 py-3">
 <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[12px] font-semibold tabular-nums text-[var(--accent-ink)]" title="Sourcing-opportunity score (0–100)">{Math.round(p.score)}</span>
 <div className="min-w-0 flex-1">
 <div className="flex flex-wrap items-center gap-2">
 <span className="text-[13px] font-semibold capitalize text-stone-900">{p.segmentValue}</span>
 <span className="text-[10px] uppercase tracking-wide text-stone-400">{p.segmentType}</span>
 {p.trend === "rising" && <StatusPill tone="info">Rising</StatusPill>}
 {p.confidence === "high" && <StatusPill tone="live">High confidence</StatusPill>}
 </div>
 <p className="mt-0.5 text-[12px] leading-relaxed text-stone-500">{p.reason}</p>
 </div>
 </div>
 ))}
 </div>
 </TechCard>
 )}

 {/* Should I source this? — quick demand verdict on any brand / item type */}
 <TechCard className="mb-6 p-5">
 <p className="mb-1 text-[13px] font-semibold text-stone-900">Should I source this?</p>
 <p className="mb-3 text-[12px] text-stone-400">Type a brand or item type — see if it&apos;s worth buying to resell.</p>
 <form onSubmit={(e) => { e.preventDefault(); runDemandSearch(buyQ); }} className="flex items-center gap-2">
 <input value={buyQ} onChange={(e) => setBuyQ(e.target.value)} placeholder="e.g. Cavalli, slip dress, Y2K, bags…" className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-[13px] text-stone-900 outline-none focus:border-[var(--accent)]" />
 <TechButton type="submit">Check</TechButton>
 </form>
 {buyLoading && <p className="mt-3 text-[12px] text-stone-400">Checking…</p>}
 {!buyLoading && buyVerdict && (
 <div className="mt-3 space-y-2">
 {/* Headline call — blends VYA demand with eBay comps; eBay leads when VYA's own signal is thin. */}
 <div className="rounded-lg border border-stone-100 bg-white px-4 py-3">
 <div className="flex flex-wrap items-center gap-2">
 <StatusPill tone={VERDICT_TONE[buyVerdict.rating]}>{buyVerdict.headline}</StatusPill>
 {buyGoogle && buyGoogle.momentumPct != null && <GChip pct={buyGoogle.momentumPct} breakout={buyGoogle.breakout} />}
 </div>
 <p className="mt-1 text-[12px] leading-relaxed text-stone-500">{buyVerdict.detail}</p>
 {buyEbay && (buyEbay.medianPrice != null || buyEbay.activeCount != null || buyEbay.soldPer30d != null) && (
 <p className="mt-1 text-[12px] text-stone-400">
  eBay: {buyEbay.medianPrice != null ? `asks ~${vmoney(buyEbay.medianPrice)}` : "—"}
  {buyEbay.p25 != null ? ` (${vmoney(buyEbay.p25)}–${vmoney(buyEbay.p75)})` : ""}
  {buyEbay.activeCount != null ? ` · ${buyEbay.activeCount.toLocaleString()} listed` : ""}
  {buyEbay.soldPer30d != null ? ` · ~${buyEbay.soldPer30d}/mo sold` : ""}
  {buyEbay.priceMomentumPct != null ? ` · price ${buyEbay.priceMomentumPct >= 0 ? "+" : ""}${buyEbay.priceMomentumPct}%` : ""}
 </p>
 )}
 </div>
 {/* VYA's own demand matches (the local detail behind the call) */}
 {buyResults && buyResults.map((r) => (
 <div key={`${r.segmentType}:${r.segmentValue}`} className="rounded-lg border border-stone-100 bg-white px-4 py-3">
 <div className="flex flex-wrap items-center gap-2">
 <span className="text-[13px] font-semibold capitalize text-stone-900">{r.segmentValue}</span>
 <span className="text-[10px] uppercase tracking-wide text-stone-400">{r.segmentType}</span>
 <StatusPill tone={VERDICT_TONE[r.verdict.rating]}>{r.verdict.headline}</StatusPill>
 </div>
 <p className="mt-0.5 text-[12px] text-stone-500">{r.verdict.detail}</p>
 <p className="mt-1 text-[12px] text-stone-400">Demand {Math.round(r.demandIndex)}/100 · Market asking {r.hasPriceData ? `${vmoney(r.priceMedian)} (${vmoney(r.priceP25)}–${vmoney(r.priceP75)})` : "—"}</p>
 </div>
 ))}
 </div>
 )}
 </TechCard>

 {/* Rising in culture — Pinterest fashion trends. Hidden until Pinterest is configured. */}
 {culture && culture.trends.length > 0 && (
 <TechCard className="mb-6 p-5">
 <div className="mb-1 flex items-center justify-between">
 <p className="text-[13px] font-semibold text-stone-900">Rising in culture</p>
 <span className="text-[11px] uppercase tracking-wide text-stone-400">Pinterest · fashion</span>
 </div>
 <p className="mb-3 text-[12px] text-stone-400">Fastest-growing fashion searches on Pinterest — where taste forms before it hits resale.</p>
 <div className="flex flex-wrap gap-2">
 {culture.trends.map((t) => (
 <span key={t.keyword} className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[12px] capitalize text-stone-700">
 {t.keyword}
 {t.growthWow != null && t.growthWow > 0 && <span className="text-[11px] font-semibold not-italic text-[var(--accent-ink)]">+{t.growthWow}%</span>}
 </span>
 ))}
 </div>
 </TechCard>
 )}

 {loading ? (
 <div className="flex items-center justify-center py-32 text-sm text-stone-400">Loading…</div>
 ) : !data ? (
 <div className="flex items-center justify-center py-32 text-sm text-stone-500">Couldn’t load trends.</div>
 ) : (
 <div className="space-y-6">
 {/* The playbook — every signal read together into a call. The actionable layer. */}
 {data.playbook && data.playbook.length > 0 && (
 <TechCard className="p-5">
 <p className="mb-1 text-[13px] font-semibold text-stone-900">What to do this week</p>
 <p className="mb-3 text-[12px] text-stone-400">VYA demand, Google search, and eBay resale — read together into one call per brand.</p>
 <div className="space-y-2">
 {data.playbook.map((p) => {
 const s = PLAY_STYLE[p.action];
 return (
 <div key={p.brand} className="flex gap-3 overflow-hidden rounded-lg border border-stone-100">
 <span className={`w-1 shrink-0 ${s.rail}`} />
 <div className="min-w-0 flex-1 py-2.5 pr-3">
 <div className="flex items-center justify-between gap-2">
 <span className="flex items-center gap-2">
 <StatusPill tone={s.tone}>{s.label}</StatusPill>
 <span className="text-[13px] font-semibold text-stone-900">{p.brand}</span>
 {p.carried && <StatusPill tone="neutral">you carry</StatusPill>}
 </span>
 {p.suggestedPriceCents ? <span className="shrink-0 text-[12px] font-medium tabular-nums text-stone-700">list ~${Math.round(p.suggestedPriceCents / 100).toLocaleString()}</span> : null}
 </div>
 <p className="mt-1 text-[12px] leading-relaxed text-stone-500">{p.reason}</p>
 </div>
 </div>
 );
 })}
 </div>
 </TechCard>
 )}

 {/* your brands — the actionable part */}
 {data.yourBrands.length > 0 && (
 <TechCard className="p-5">
 <p className="mb-1 text-[13px] font-semibold text-stone-900">Your brands on VYA</p>
 <p className="mb-3 text-[12px] text-stone-400">How the brands you carry are trending in marketplace demand.</p>
 <div className="divide-y divide-stone-100">
 {data.yourBrands.map((b) => (
 <div key={b.brand} className="flex items-center justify-between py-2">
 <div className="min-w-0">
 <span className="text-[13px] font-medium text-stone-800">{b.brand}</span>
 <span className="ml-2 text-[11px] text-stone-400">#{b.rank} in demand</span>
 </div>
 <div className="flex items-center gap-3">
 <span className="hidden max-w-[220px] truncate text-[11px] text-stone-400 sm:inline">{b.note}</span>
 <Momentum pct={b.momentumPct} />
 </div>
 </div>
 ))}
 </div>
 </TechCard>
 )}

 <div className="grid gap-4 sm:grid-cols-2">
 {/* rising brands */}
 <TechCard className="p-5">
 <p className="mb-3 text-[13px] font-semibold text-stone-900">Rising brands</p>
 {data.rising.length === 0 ? <p className="py-4 text-center text-[12px] text-stone-400">Not enough marketplace signal yet.</p> : (
 <div className="space-y-1.5">
 {data.rising.map((b) => {
 const g = data.googleTrends?.find((x) => x.brand.toLowerCase() === b.brand.toLowerCase());
 return (
 <div key={b.brand} className="flex items-center justify-between text-[13px]">
 <span className="flex items-center gap-2"><span className="w-5 tabular-nums text-stone-300">{b.rank}</span><span className="text-stone-800">{b.brand}</span></span>
 <span className="flex items-center gap-2">
 {g && <GChip pct={g.momentumPct} breakout={g.breakout} />}
 <Momentum pct={b.momentumPct} breakout={b.isBreakout} />
 </span>
 </div>
 );
 })}
 </div>
 )}
 </TechCard>

 {/* categories */}
 <TechCard className="p-5">
 <p className="mb-3 text-[13px] font-semibold text-stone-900">Categories heating up</p>
 {data.categories.length === 0 ? <p className="py-4 text-center text-[12px] text-stone-400">Not enough marketplace signal yet.</p> : (
 <div className="space-y-1.5">
 {data.categories.map((c) => (
 <div key={c.key} className="flex items-center justify-between text-[13px]">
 <span className="flex items-center gap-2"><span className="w-5 tabular-nums text-stone-300">{c.rank}</span><span className="capitalize text-stone-800">{c.key}</span></span>
 <Momentum pct={c.momentumPct} breakout={c.isBreakout} />
 </div>
 ))}
 </div>
 )}
 </TechCard>
 </div>

 {/* Across the web — real Google Search interest */}
 {data.webConfigured ? (
 data.googleTrends.length > 0 && (
 <TechCard className="p-5">
 <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-stone-900"><span className="grid h-4 w-4 place-items-center rounded-full bg-sky-100 font-mono text-[9px] font-bold text-sky-700">G</span> Across the web — Google Search</p>
 <p className="mb-3 text-[12px] text-stone-400">Real search interest &amp; 3-month momentum for these brands (Google Trends) — demand beyond VYA.</p>
 <div className="divide-y divide-stone-100">
 {[...data.googleTrends].sort((a, b) => (b.breakout ? 1 : 0) - (a.breakout ? 1 : 0) || (b.momentumPct ?? -999) - (a.momentumPct ?? -999)).slice(0, 12).map((g) => (
 <div key={g.brand} className="flex items-center justify-between py-2 text-[13px]">
 <span className="text-stone-800">{g.brand}</span>
 <div className="flex items-center gap-3">
 <span className="hidden text-[11px] tabular-nums text-stone-400 sm:inline">interest {g.avgInterest}/100</span>
 <Momentum pct={g.momentumPct} breakout={g.breakout} />
 </div>
 </div>
 ))}
 </div>
 </TechCard>
 )
 ) : null}

 {/* Resale market — real eBay SOLD listings */}
 {data.webConfigured && data.resaleMarket.length > 0 && (
 <TechCard className="p-5">
 <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-stone-900"><span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--accent-soft,#eafaf3)] font-mono text-[9px] font-bold text-[var(--accent-ink,#0b7a5c)]">$</span> Resale market — eBay sold + web asking</p>
 <p className="mb-3 text-[12px] text-stone-400"><span className="font-medium">sold</span> = real eBay completed-sale median · <span className="font-medium">web</span> = median asking across resale sites (Google Shopping: Vestiaire, Grailed, RealReal…). Momentum = vs. a week ago.</p>
 <div className="divide-y divide-stone-100">
 {[...data.resaleMarket].sort((a, b) => b.soldCount - a.soldCount).slice(0, 12).map((r) => (
 <div key={r.brand} className="flex items-center justify-between py-2 text-[13px]">
 <span className="min-w-0 truncate text-stone-800">{r.brand}</span>
 <div className="flex items-center gap-3">
 <span className="text-[11px] tabular-nums text-stone-400">{r.soldCount.toLocaleString()} sold{r.medianPriceCents ? ` · sold ~$${Math.round(r.medianPriceCents / 100).toLocaleString()}` : ""}{r.webMedianCents ? ` · web ~$${Math.round(r.webMedianCents / 100).toLocaleString()}` : ""}</span>
 {r.volMomentumPct !== null ? <Momentum pct={r.volMomentumPct} /> : <span className="text-[11px] text-stone-300">building…</span>}
 </div>
 </div>
 ))}
 </div>
 </TechCard>
 )}

 {/* Social buzz — Instagram (a leading cultural signal) */}
 {data.socialConfigured && data.igBuzz && data.igBuzz.length > 0 && (
 <TechCard className="p-5">
 <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-stone-900"><span className="grid h-4 w-4 place-items-center rounded-full bg-fuchsia-100 font-mono text-[9px] font-bold text-fuchsia-700">IG</span> Social buzz — Instagram</p>
 <p className="mb-3 text-[12px] text-stone-400">Engagement on each brand&rsquo;s top hashtag posts — a <span className="font-medium">leading</span> signal (social heat runs ahead of resale). Momentum = vs. a week ago.</p>
 <div className="divide-y divide-stone-100">
 {[...data.igBuzz].sort((a, b) => (b.momentumPct ?? -999) - (a.momentumPct ?? -999) || b.buzzScore - a.buzzScore).slice(0, 12).map((b) => (
 <div key={b.brand} className="flex items-center justify-between py-2 text-[13px]">
 <span className="min-w-0 truncate text-stone-800">{b.brand}</span>
 <div className="flex items-center gap-3">
 <span className="hidden text-[11px] tabular-nums text-stone-400 sm:inline">{b.buzzScore.toLocaleString()} engagements</span>
 {b.momentumPct !== null ? <Momentum pct={b.momentumPct} /> : <span className="text-[11px] text-stone-300">building…</span>}
 </div>
 </div>
 ))}
 </div>
 </TechCard>
 )}

 {!data.webConfigured && !data.socialConfigured && (
 <TechCard className="p-5">
 <p className="text-[13px] font-semibold text-stone-900">Add web signals — Google Search &amp; resale sites</p>
 <p className="mt-1 text-[12px] text-stone-500">Blend real Google Search momentum (and resale-market comps) into these trends. Turn on SerpApi (<span className="font-mono text-[11px]">SERPAPI_ENABLED=true</span>) to activate — it stays dormant, with no calls or spend, until then.</p>
 </TechCard>
 )}

 <p className="text-[11px] text-stone-400">VYA momentum = weighted views, favorites, searches, and sales vs. the prior 30 days. <span className="font-mono">G</span> = Google Search interest · eBay = real sold volume/price · web = resale-site asking · IG = Instagram buzz (leading). Signals to source toward, not guarantees.</p>
 </div>
 )}
 </AdminPage>
 );
}
