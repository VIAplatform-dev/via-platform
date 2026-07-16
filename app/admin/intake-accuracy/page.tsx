"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type FieldAccuracy = { field: string; accepted: number; corrected: number; accuracyPct: number };
type BrandMiss = { from: string; to: string; n: number };
type PriceCalibration = { samples: number; medianRatio: number; overpricedPct: number; underpricedPct: number; avgAbsErrorPct: number };
type SegmentStat = { category: string; publishes: number; priced: number; medianRatio: number | null; offPct: number | null; avgErrorPct: number | null };
type BrandSegmentStat = { category: string; graded: number; correct: number; pct: number };
type CorrectionRow = { field: string; aiValue: string | null; finalValue: string | null; imageUrl: string | null; store: string; at: string };
type Verdict = "pass" | "close" | "fail" | "insufficient";
type DimVerdict = { dimension: string; label: string; n: number; correct: number; pct: number | null; ci95: [number, number] | null; verdict: Verdict; note: string };
type PriceScore = { segment: string; n: number; within10: number; within20: number; within10Pct: number | null; within20Pct: number | null; ci95: [number, number] | null; medianErrorPct: number | null; verdict: Verdict };
type BetaReadiness = { gate: number; ready: boolean; blockers: string[]; brand: DimVerdict; specific: DimVerdict; price: { overall: PriceScore; byCategory: PriceScore[]; byTier: PriceScore[]; totalGraded: number }; goldenRanAt: string | null };
type Data = {
 periodDays: number;
 totalPublishes: number;
 totalCorrections: number;
 fields: FieldAccuracy[];
 topBrandMisses: BrandMiss[];
 price: PriceCalibration;
 segments: SegmentStat[];
 brandSegments: BrandSegmentStat[];
 corrections: CorrectionRow[];
 betaReadiness: BetaReadiness | null;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
 return (
 <div className="rounded-xl border border-stone-200 bg-white p-4">
 <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-400">{label}</p>
 <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">{value}</p>
 {hint && <p className="mt-0.5 text-[11px] text-stone-400">{hint}</p>}
 </div>
 );
}

const VERDICT_STYLE: Record<Verdict, { t: string; chip: string; ring: string }> = {
 pass: { t: "PASS", chip: "bg-emerald-100 text-emerald-800", ring: "ring-emerald-200" },
 close: { t: "SO CLOSE", chip: "bg-amber-100 text-amber-800", ring: "ring-amber-200" },
 fail: { t: "BELOW 95%", chip: "bg-red-100 text-red-700", ring: "ring-red-200" },
 insufficient: { t: "NEED DATA", chip: "bg-stone-100 text-stone-500", ring: "ring-stone-200" },
};
const ciStr = (ci: [number, number] | null) => (ci ? `${Math.round(ci[0] * 100)}–${Math.round(ci[1] * 100)}%` : null);

// One gated dimension (brand / price / specific): the number, its 95% CI, and the pass/fail verdict.
function MetricCard({ label, pct, n, ci, verdict, sub }: { label: string; pct: number | null; n: number; ci: [number, number] | null; verdict: Verdict; sub?: string }) {
 const v = VERDICT_STYLE[verdict];
 return (
 <div className={`rounded-xl border border-stone-200 bg-white p-4 ring-1 ${v.ring}`}>
 <div className="flex items-center justify-between gap-2">
 <p className="text-[12px] font-medium text-stone-700">{label}</p>
 <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide ${v.chip}`}>{v.t}</span>
 </div>
 <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums text-stone-900">{pct == null ? "—" : `${pct}%`}</p>
 <p className="mt-1.5 text-[10.5px] text-stone-400">{n ? `n=${n}${ci ? ` · 95% CI ${ciStr(ci)}` : ""}` : "no data yet"}{sub ? ` · ${sub}` : ""}</p>
 </div>
 );
}

function Readiness({ b }: { b: BetaReadiness }) {
 const p = b.price.overall;
 const segs = [...b.price.byTier, ...b.price.byCategory].filter((s) => s.n > 0);
 return (
 <section className="rounded-2xl border border-stone-200 bg-gradient-to-b from-white to-stone-50/70 p-5">
 <div className="flex items-start justify-between gap-4">
 <div>
 <h2 className="text-[15px] font-semibold text-stone-900">Beta readiness</h2>
 <p className="mt-0.5 text-[11px] text-stone-500">Brand, price, and specific-piece must each clear <b>95%</b> — judged on the <i>lower</i> end of the confidence interval, so a lucky small sample can’t call it. Price is graded against what items actually sold for.</p>
 </div>
 <span className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold ${b.ready ? "bg-emerald-600 text-white" : "bg-stone-800 text-white"}`}>{b.ready ? "READY ✓" : "NOT READY"}</span>
 </div>
 <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
 <MetricCard label="Brand ID" pct={b.brand.pct} n={b.brand.n} ci={b.brand.ci95} verdict={b.brand.verdict} sub="golden exam" />
 <MetricCard label="Price" pct={p.within10Pct} n={p.n} ci={p.ci95} verdict={p.verdict} sub="within ±10% of sold" />
 <MetricCard label="Specific piece" pct={b.specific.pct} n={b.specific.n} ci={b.specific.ci95} verdict={b.specific.verdict} sub="golden exam" />
 </div>
 {b.blockers.length > 0 && (
 <div className="mt-3 rounded-lg border border-stone-200 bg-white px-3 py-2">
 <p className="text-[11px] font-medium text-stone-600">What’s standing between here and beta:</p>
 <ul className="mt-1 space-y-0.5">
 {b.blockers.map((x, i) => <li key={i} className="text-[11.5px] text-stone-500">• {x}</li>)}
 </ul>
 </div>
 )}
 {!b.goldenRanAt && (
 <p className="mt-2 text-[11px] text-amber-700">Brand &amp; specific are blank until you curate the golden set and run the golden exam (<code>POST /api/admin/eval {"{"}goldenOnly:true{"}"}</code>). Price grades on its own from real sales (<code>POST /api/admin/price-eval</code>).</p>
 )}
 {segs.length > 0 && (
 <div className="mt-3 overflow-x-auto">
 <p className="mb-1.5 text-[11px] font-medium text-stone-500">Price accuracy by segment <span className="font-normal text-stone-400">— where it’s solid vs weak</span></p>
 <table className="w-full text-[12px]">
 <thead className="text-left text-[10px] uppercase tracking-wide text-stone-400"><tr><th className="py-1 pr-4 font-medium">Segment</th><th className="py-1 pr-4 font-medium">Graded</th><th className="py-1 pr-4 font-medium">±10%</th><th className="py-1 pr-4 font-medium">±20%</th><th className="py-1 pr-4 font-medium">Median err</th><th className="py-1 font-medium">Verdict</th></tr></thead>
 <tbody>
 {segs.map((s) => (
 <tr key={s.segment} className="border-t border-stone-100">
 <td className="py-1.5 pr-4 capitalize text-stone-700">{s.segment}</td>
 <td className="py-1.5 pr-4 tabular-nums text-stone-500">{s.n}</td>
 <td className="py-1.5 pr-4 tabular-nums font-semibold text-stone-800">{s.within10Pct == null ? "—" : `${s.within10Pct}%`}</td>
 <td className="py-1.5 pr-4 tabular-nums text-stone-500">{s.within20Pct == null ? "—" : `${s.within20Pct}%`}</td>
 <td className="py-1.5 pr-4 tabular-nums text-stone-500">{s.medianErrorPct == null ? "—" : `±${s.medianErrorPct}%`}</td>
 <td className="py-1.5"><span className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold ${VERDICT_STYLE[s.verdict].chip}`}>{VERDICT_STYLE[s.verdict].t}</span></td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </section>
 );
}

type TrainingStats = { total: number; bySource: { source: string; count: number; withBrand: number; withPrice: number; withImage: number }[] };
type EvalResult = { sample: number; withReverseImage: boolean; fields: { field: string; correct: number; total: number; pct: number }[]; price?: { within20: number; total: number; pct: number }; misses: { field: string; image: string; guessed: string | null; truth: string }[] };
type EvalRun = { ranAt: string; sample: number; brandPct: number | null; eraPct: number | null; categoryPct: number | null; pricePct: number | null };
type ArmScore = { brand: { pct: number | null; correct: number; total: number }; specific: { pct: number | null; correct: number; total: number }; era: { pct: number | null; correct: number; total: number } };
type AblationRun = { sample: number; goldenOnly: boolean; memoryHitRate: number; base: ArmScore; withMemory: ArmScore; delta: { brandPct: number | null; specificPct: number | null; eraPct: number | null }; note: string };
const pctStr = (n: number | null) => (n == null ? "—" : `${n}%`);
const SOURCE_LABEL: Record<string, string> = { intake: "AI listings", items: "VYA inventory", marketplace: "Marketplace" };

export default function IntakeAccuracyPage() {
 const router = useRouter();
 const [data, setData] = useState<Data | null>(null);
 const [loading, setLoading] = useState(true);
 const [days, setDays] = useState(30);
 const [train, setTrain] = useState<TrainingStats | null>(null);
 const [backfilling, setBackfilling] = useState(false);
 const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
 const [evalRunning, setEvalRunning] = useState(false);
 const [evalSample, setEvalSample] = useState(15);
 const [evalPrice, setEvalPrice] = useState(false);
 const [evalRuns, setEvalRuns] = useState<EvalRun[]>([]);
 const [ablation, setAblation] = useState<AblationRun | null>(null);
 const [ablationRunning, setAblationRunning] = useState(false);

 useEffect(() => {
 fetch(`/api/admin/intake-accuracy?days=${days}`)
 .then((r) => {
 if (r.status === 401) { router.replace("/admin/login?redirect=/admin/intake-accuracy"); return null; }
 return r.ok ? r.json() : null;
 })
 .then((d) => d && setData(d))
 .finally(() => setLoading(false));
 }, [days, router]);

 useEffect(() => {
 fetch("/api/admin/training-data").then((r) => (r.ok ? r.json() : null)).then((d) => d && setTrain(d)).catch(() => {});
 fetch("/api/admin/eval").then((r) => (r.ok ? r.json() : null)).then((d) => d && setEvalRuns(d.runs || [])).catch(() => {});
 }, []);

 async function backfill() {
 setBackfilling(true);
 try {
 const r = await fetch("/api/admin/training-data", { method: "POST" });
 if (r.ok) setTrain(await r.json());
 } catch { /* ignore */ }
 setBackfilling(false);
 }

 async function runExam() {
 setEvalRunning(true);
 try {
 const r = await fetch("/api/admin/eval", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sample: evalSample, withPrice: evalPrice }) });
 if (r.ok) setEvalResult(await r.json());
 fetch("/api/admin/eval").then((res) => (res.ok ? res.json() : null)).then((d) => d && setEvalRuns(d.runs || [])).catch(() => {});
 } catch { /* ignore */ }
 setEvalRunning(false);
 }

 async function runAblationNow() {
 setAblationRunning(true);
 try {
 const r = await fetch("/api/admin/ablation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sample: 15 }) });
 if (r.ok) setAblation(await r.json());
 } catch { /* ignore */ }
 setAblationRunning(false);
 }

 const price = data?.price;
 // Calibration verdict — honest about sample size + spread, not just the median.
 const cal = !price || price.samples < 3 ? null
 : price.samples < 10 ? { t: `Too little data · ${price.samples} listings`, c: "text-stone-400" }
 : price.medianRatio >= 0.9 && price.medianRatio <= 1.1
 ? (price.avgAbsErrorPct > 30 ? { t: `Centered, but noisy (±${price.avgAbsErrorPct}% per item)`, c: "text-amber-600" } : { t: "Well calibrated", c: "text-emerald-600" })
 : price.medianRatio < 0.9 ? { t: `Runs ~${Math.round((1 - price.medianRatio) * 100)}% HIGH`, c: "text-red-600" }
 : { t: `Runs ~${Math.round((price.medianRatio - 1) * 100)}% LOW`, c: "text-amber-600" };

 return (
 <div className="mx-auto max-w-4xl px-6 py-8">
 <div className="mb-6 flex items-end justify-between">
 <div>
 <h1 className="text-xl font-semibold tracking-tight text-stone-900">Intake AI accuracy</h1>
 <p className="mt-1 text-[13px] text-stone-500">Where the listing AI gets corrected — the feedback loop, measured. Cross-store.</p>
 </div>
 <div className="inline-flex rounded-lg border border-stone-200 p-0.5 text-[12px]">
 {[30, 90, 3650].map((d) => (
 <button key={d} onClick={() => setDays(d)} className={`rounded-md px-3 py-1 transition ${days === d ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-800"}`}>
 {d === 3650 ? "All time" : `${d}d`}
 </button>
 ))}
 </div>
 </div>

 {/* Training dataset — labeled examples banked for a future VYA model. */}
 {train && (
 <div className="mb-6 rounded-xl border border-stone-200 bg-white p-5">
 <div className="mb-3 flex items-center justify-between">
 <div>
 <p className="text-[13px] font-medium text-stone-700">Training dataset</p>
 <p className="text-[11px] text-stone-400">Clean, labeled examples banked for a future VYA model — new AI listings + everything already on the platform.</p>
 </div>
 <button onClick={backfill} disabled={backfilling} className="shrink-0 rounded-lg border border-stone-300 px-3 py-1.5 text-[12px] font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50">
 {backfilling ? "Backfilling…" : "Backfill existing listings"}
 </button>
 </div>
 <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
 <span className="text-2xl font-semibold tabular-nums text-stone-900">{train.total.toLocaleString()}<span className="ml-1 text-[12px] font-normal text-stone-400">examples</span></span>
 {train.bySource.map((s) => (
 <span key={s.source} className="text-[12px] text-stone-500">
 <b className="tabular-nums text-stone-800">{s.count.toLocaleString()}</b> {SOURCE_LABEL[s.source] || s.source}
 <span className="text-stone-400"> · {s.withImage.toLocaleString()} img · {s.withBrand.toLocaleString()} brand · {s.withPrice.toLocaleString()} price</span>
 </span>
 ))}
 </div>
 </div>
 )}

 {/* Practice exam — grade the current AI against labeled photos. */}
 <div className="mb-6 rounded-xl border border-stone-200 bg-white p-5">
 <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
 <div>
 <p className="text-[13px] font-medium text-stone-700">Practice exam</p>
 <p className="text-[11px] text-stone-400">Run the current AI on labeled photos and grade it — do this before &amp; after a prompt change to see if it improved. Costs a little per photo.</p>
 </div>
 <div className="flex items-center gap-2">
 <select value={evalSample} onChange={(e) => setEvalSample(Number(e.target.value))} className="rounded-lg border border-stone-300 px-2 py-1.5 text-[12px]">
 {[10, 15, 25, 50].map((n) => <option key={n} value={n}>{n} photos</option>)}
 </select>
 <label className="flex items-center gap-1 text-[11px] text-stone-500"><input type="checkbox" checked={evalPrice} onChange={(e) => setEvalPrice(e.target.checked)} className="accent-stone-800" />+ price</label>
 <button onClick={runExam} disabled={evalRunning} className="rounded-lg bg-stone-900 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50">{evalRunning ? "Grading…" : "Run exam"}</button>
 </div>
 </div>
 {evalRunning && <p className="text-[12px] text-stone-400">Running the AI on {evalSample} photos — this can take a minute…</p>}
 {evalResult && !evalRunning && (
 <div>
 <div className="flex flex-wrap gap-3">
 {evalResult.fields.map((f) => (
 <div key={f.field} className="rounded-lg bg-stone-50 px-4 py-2 text-center">
 <p className="text-lg font-semibold tabular-nums text-stone-900">{f.total ? `${f.pct}%` : "—"}</p>
 <p className="text-[11px] text-stone-500">{cap(f.field)} <span className="text-stone-400">({f.correct}/{f.total})</span></p>
 </div>
 ))}
 {evalResult.price && (
 <div className="rounded-lg bg-stone-50 px-4 py-2 text-center">
 <p className="text-lg font-semibold tabular-nums text-stone-900">{evalResult.price.pct}%</p>
 <p className="text-[11px] text-stone-500">Price ±20% <span className="text-stone-400">({evalResult.price.within20}/{evalResult.price.total})</span></p>
 </div>
 )}
 </div>
 <p className="mt-2 text-[11px] text-stone-400">Graded {evalResult.sample} photos{evalResult.withReverseImage ? " · reverse image on" : ""}.</p>
 {evalResult.misses.length > 0 && (
 <div className="mt-3 border-t border-stone-100 pt-3">
 <p className="mb-2 text-[12px] font-medium text-stone-400">Misses ({evalResult.misses.length})</p>
 <div className="space-y-1">
 {evalResult.misses.map((m, i) => (
 <div key={i} className="flex items-center gap-2 text-[12px]">
 <span className="w-16 shrink-0 text-stone-400">{m.field}</span>
 <span className="text-red-600 line-through decoration-red-300">{m.guessed || "—"}</span>
 <span className="text-stone-400">→</span>
 <span className="font-medium text-emerald-700">{m.truth}</span>
 <a href={m.image} target="_blank" rel="noopener noreferrer" className="ml-auto shrink-0 text-[11px] text-stone-400 underline">photo</a>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 )}
 </div>

 {/* Ablation — does the learning loop actually add accuracy? Memory OFF vs ON, same items. */}
 <div className="mb-6 rounded-xl border border-stone-200 bg-white p-5">
 <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
 <div>
 <p className="text-[13px] font-medium text-stone-700">Does memory actually help? <span className="font-normal text-stone-400">— the honest test</span></p>
 <p className="text-[11px] text-stone-400">Runs the same photos with the learning loop OFF vs ON. A positive delta = memory is really adding accuracy; ~0 = it isn’t (usually because the corpus is still empty). Reverse-image is held out so the delta is memory alone.</p>
 </div>
 <button onClick={runAblationNow} disabled={ablationRunning} className="shrink-0 rounded-lg bg-stone-900 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50">{ablationRunning ? "Running…" : "Run A/B"}</button>
 </div>
 {ablationRunning && <p className="text-[12px] text-stone-400">Drafting each photo twice (off vs on) — this takes a minute…</p>}
 {ablation && !ablationRunning && (
 <div>
 <div className="overflow-x-auto">
 <table className="w-full text-[12px]">
 <thead className="text-left text-[11px] uppercase tracking-wide text-stone-400"><tr><th className="py-1 pr-4 font-medium">Dimension</th><th className="py-1 pr-4 font-medium">Memory off</th><th className="py-1 pr-4 font-medium">Memory on</th><th className="py-1 font-medium">Lift</th></tr></thead>
 <tbody>
 {([["Brand", ablation.base.brand, ablation.withMemory.brand, ablation.delta.brandPct], ["Specific", ablation.base.specific, ablation.withMemory.specific, ablation.delta.specificPct], ["Era", ablation.base.era, ablation.withMemory.era, ablation.delta.eraPct]] as [string, ArmScore["brand"], ArmScore["brand"], number | null][]).map(([label, off, on, delta]) => (
 <tr key={label} className="border-t border-stone-100">
 <td className="py-1.5 pr-4 text-stone-700">{label}</td>
 <td className="py-1.5 pr-4 tabular-nums text-stone-500">{off.pct == null ? "—" : `${off.pct}%`}</td>
 <td className="py-1.5 pr-4 tabular-nums text-stone-800">{on.pct == null ? "—" : `${on.pct}%`}</td>
 <td className={`py-1.5 tabular-nums font-semibold ${delta == null ? "text-stone-400" : delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-600" : "text-stone-400"}`}>{delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta} pts`}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 <p className="mt-2 text-[11px] text-stone-400">Graded {ablation.sample} photos{ablation.goldenOnly ? " · golden set" : ""} · memory produced a hint on {ablation.memoryHitRate}% of them.</p>
 <p className={`mt-1 text-[11.5px] ${ablation.memoryHitRate === 0 ? "text-amber-700" : "text-stone-500"}`}>{ablation.note}</p>
 </div>
 )}
 </div>

 {/* Weekly exam history — auto-runs Mondays; watch the trend climb. */}
 {evalRuns.length > 0 && (
 <div className="mb-6 rounded-xl border border-stone-200 bg-white p-5">
 <p className="mb-1 text-[13px] font-medium text-stone-700">Weekly exams</p>
 <p className="mb-3 text-[11px] text-stone-400">Runs automatically on Mondays. Run the exam on-demand (above) right after a change to see it move.</p>
 <div className="overflow-x-auto">
 <table className="w-full text-[12px]">
 <thead>
 <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-stone-400">
 <th className="py-1.5 pr-4 font-medium">When</th>
 <th className="py-1.5 pr-4 font-medium">Brand</th>
 <th className="py-1.5 pr-4 font-medium">Era</th>
 <th className="py-1.5 pr-4 font-medium">Category</th>
 <th className="py-1.5 pr-4 font-medium">Price</th>
 <th className="py-1.5 text-right font-medium">n</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-stone-100">
 {evalRuns.map((r, i) => (
 <tr key={i}>
 <td className="py-1.5 pr-4 text-stone-600">{new Date(r.ranAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
 <td className="py-1.5 pr-4 font-semibold tabular-nums text-stone-900">{pctStr(r.brandPct)}</td>
 <td className="py-1.5 pr-4 tabular-nums text-stone-600">{pctStr(r.eraPct)}</td>
 <td className="py-1.5 pr-4 tabular-nums text-stone-600">{pctStr(r.categoryPct)}</td>
 <td className="py-1.5 pr-4 tabular-nums text-stone-600">{pctStr(r.pricePct)}</td>
 <td className="py-1.5 text-right tabular-nums text-stone-400">{r.sample}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}

 {loading && !data ? (
 <div className="py-24 text-center text-sm text-stone-400">Loading…</div>
 ) : !data || data.totalPublishes === 0 ? (
 <div className="rounded-xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-500">
 No AI-drafted listings in this period yet. As sellers publish, this fills in.
 </div>
 ) : (
 <div className="space-y-6">
 {data.betaReadiness && <Readiness b={data.betaReadiness} />}
 {data.totalPublishes < 25 && (
 <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-[12px] text-amber-800">
 <b>Still early — {data.totalPublishes} AI-drafted listing{data.totalPublishes === 1 ? "" : "s"} so far.</b> These numbers are <b>directional, not reliable yet</b> — a single item can swing a whole category. They get trustworthy as sellers publish (aim for a few dozen per category). Rows below with too few listings are marked as such.
 </div>
 )}
 <div className="grid grid-cols-3 gap-3">
 <Stat label="Listings" value={data.totalPublishes.toLocaleString()} hint="AI-drafted, published" />
 <Stat label="Corrections" value={data.totalCorrections.toLocaleString()} hint="fields sellers changed" />
 <Stat label="Price median" value={price ? `${price.medianRatio.toFixed(2)}×` : "—"} hint={cal ? cal.t : "need ≥3 priced"} />
 </div>

 {/* Field correction rates */}
 <div className="rounded-xl border border-stone-200 bg-white p-5">
 <p className="mb-1 text-[13px] font-medium text-stone-700">Per-field accuracy</p>
 <p className="mb-4 text-[11px] text-stone-400">Of the fields the AI predicted, the share the seller kept unchanged. Green = kept, red = fixed.</p>
 <div className="space-y-2.5">
 {data.fields.map((f) => (
 <div key={f.field} className="flex items-center gap-3 text-[13px]">
 <span className="w-20 shrink-0 text-stone-700">{cap(f.field)}</span>
 <div className="h-2 flex-1 overflow-hidden rounded-full bg-red-200">
 <div className="h-full rounded-full bg-emerald-500" style={{ width: `${f.accuracyPct}%` }} />
 </div>
 <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-stone-900">
 {f.accepted + f.corrected ? `${f.accuracyPct}%` : "—"}
 </span>
 <span className="w-24 shrink-0 text-right text-[11px] text-stone-400">{f.accepted} kept · {f.corrected} fixed</span>
 </div>
 ))}
 </div>
 </div>

 {/* Price calibration */}
 {price && price.samples >= 3 && (
 <div className="rounded-xl border border-stone-200 bg-white p-5">
 <div className="mb-3 flex items-baseline justify-between">
 <p className="text-[13px] font-medium text-stone-700">Price calibration</p>
 {cal && <span className={`text-[12px] font-semibold ${cal.c}`}>{cal.t}</span>}
 </div>
 <div className="grid grid-cols-3 gap-3 text-center">
 <div className="rounded-lg bg-stone-50 p-3"><p className="text-lg font-semibold tabular-nums text-red-600">{price.overpricedPct}%</p><p className="text-[11px] text-stone-500">priced too HIGH<br />(seller cut &gt;20%)</p></div>
 <div className="rounded-lg bg-stone-50 p-3"><p className="text-lg font-semibold tabular-nums text-amber-600">{price.underpricedPct}%</p><p className="text-[11px] text-stone-500">priced too LOW<br />(seller raised &gt;25%)</p></div>
 <div className="rounded-lg bg-stone-50 p-3"><p className="text-lg font-semibold tabular-nums text-stone-900">±{price.avgAbsErrorPct}%</p><p className="text-[11px] text-stone-500">avg error<br />vs. seller’s price</p></div>
 </div>
 <p className="mt-3 text-[11px] text-stone-400">Based on {price.samples} listings with both an AI market value and a final price. Some gap reflects a store’s own positioning, not model error.</p>
 </div>
 )}

 {/* Top brand confusions */}
 {data.topBrandMisses.length > 0 && (
 <div className="rounded-xl border border-stone-200 bg-white p-5">
 <p className="mb-1 text-[13px] font-medium text-stone-700">Top brand confusions</p>
 <p className="mb-3 text-[11px] text-stone-400">The AI guessed the first, sellers corrected to the second. Repeat offenders → prompt/lens targets.</p>
 <div className="space-y-1.5">
 {data.topBrandMisses.map((m, i) => (
 <div key={i} className="flex items-center gap-2 text-[13px]">
 <span className="text-red-600 line-through decoration-red-300">{m.from}</span>
 <span className="text-stone-400">→</span>
 <span className="font-medium text-emerald-700">{m.to}</span>
 {m.n > 1 && <span className="ml-1 rounded-full bg-stone-100 px-2 text-[11px] text-stone-500">×{m.n}</span>}
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Brand accuracy by category — where the model IDs the brand right vs wrong */}
 {data.brandSegments && data.brandSegments.length > 0 && (
 <div className="rounded-xl border border-stone-200 bg-white p-5">
 <p className="mb-1 text-[13px] font-medium text-stone-700">Brand accuracy — by category</p>
 <p className="mb-3 text-[11px] text-stone-400">How often the AI gets the brand right when the seller didn’t type it (graded house-level — Dior = Christian Dior). Only cases where the model actually did the identifying.</p>
 <div className="overflow-x-auto">
 <table className="w-full text-[12px]">
 <thead className="text-left text-[11px] uppercase tracking-wide text-stone-400">
 <tr><th className="py-1.5 pr-4 font-medium">Category</th><th className="py-1.5 pr-4 font-medium">Graded</th><th className="py-1.5 font-medium">Brand correct</th></tr>
 </thead>
 <tbody>
 {data.brandSegments.map((s) => {
 const thin = s.graded < 3;
 const c = thin ? "text-stone-400" : s.pct >= 85 ? "text-emerald-600" : s.pct >= 65 ? "text-amber-600" : "text-red-600";
 return (
 <tr key={s.category} className="border-t border-stone-100">
 <td className="py-1.5 pr-4 capitalize text-stone-700">{s.category}</td>
 <td className="py-1.5 pr-4 tabular-nums text-stone-500">{s.graded}</td>
 <td className={`py-1.5 font-semibold tabular-nums ${c}`}>{thin ? `too few to judge (${s.graded})` : <>{s.pct}% <span className="font-normal text-stone-400">({s.correct}/{s.graded} right)</span></>}</td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </div>
 )}

 {/* Where pricing lands — by category (where it fails vs works) */}
 {data.segments && data.segments.length > 0 && (
 <div className="rounded-xl border border-stone-200 bg-white p-5">
 <p className="mb-1 text-[13px] font-medium text-stone-700">Where pricing lands — by category</p>
 <p className="mb-3 text-[11px] text-stone-400">Is the AI’s price landing near where sellers actually list? <b>1.00× = spot on;</b> above 1 means the AI priced too <b>low</b>, below 1 too <b>high</b>. Categories under 3 priced listings are too thin to judge — they’ll firm up as you list.</p>
 <div className="overflow-x-auto">
 <table className="w-full text-[12px]">
 <thead className="text-left text-[11px] uppercase tracking-wide text-stone-400">
 <tr><th className="py-1.5 pr-4 font-medium">Category</th><th className="py-1.5 pr-4 font-medium">Priced</th><th className="py-1.5 pr-4 font-medium">Median</th><th className="py-1.5 font-medium">Reading</th></tr>
 </thead>
 <tbody>
 {data.segments.map((s) => {
 const r = s.medianRatio;
 const thin = s.priced < 3;
 const show = !thin && r != null;
 const reading = s.priced === 0 ? "No priced listings yet"
 : thin ? `Too thin to judge — only ${s.priced}`
 : r == null ? "—"
 : r >= 0.9 && r <= 1.1 ? "On the money"
 : r > 1.3 ? `AI priced way too LOW (sellers listed ~${Math.round((r - 1) * 100)}% higher)`
 : r > 1.1 ? "AI runs a bit low"
 : r < 0.75 ? `AI priced way too HIGH (sellers cut ~${Math.round((1 - r) * 100)}%)`
 : "AI runs a bit high";
 const c = !show ? "text-stone-400" : r >= 0.9 && r <= 1.1 ? "text-emerald-600" : (r < 0.75 || r > 1.3) ? "text-red-600" : "text-amber-600";
 return (
 <tr key={s.category} className="border-t border-stone-100">
 <td className="py-1.5 pr-4 capitalize text-stone-700">{s.category}</td>
 <td className="py-1.5 pr-4 tabular-nums text-stone-500">{s.priced}<span className="text-stone-300"> / {s.publishes}</span></td>
 <td className={`py-1.5 pr-4 font-semibold tabular-nums ${c}`}>{show ? `${r.toFixed(2)}×` : "—"}</td>
 <td className={`py-1.5 ${c}`}>{reading}</td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </div>
 )}

 {/* What sellers are changing — the live correction feed (what people are putting in) */}
 {data.corrections && data.corrections.length > 0 && (
 <div className="rounded-xl border border-stone-200 bg-white p-5">
 <p className="mb-1 text-[13px] font-medium text-stone-700">What sellers are changing</p>
 <p className="mb-3 text-[11px] text-stone-400">Every field a seller corrected from the AI’s draft, newest first — the raw stream of where the model is wrong, with the photo.</p>
 <div className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
 {data.corrections.map((c, i) => (
 <div key={i} className="flex items-center gap-2.5 rounded-lg border border-stone-100 px-2 py-1.5">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 {c.imageUrl ? <img src={c.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-md bg-stone-100 object-cover" /> : <div className="h-9 w-9 shrink-0 rounded-md bg-stone-100" />}
 <span className="w-16 shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-stone-500">{c.field}</span>
 <span className="min-w-0 flex-1 truncate">
 <span className="text-red-600 line-through decoration-red-300">{c.aiValue || "—"}</span>
 <span className="mx-1.5 text-stone-400">→</span>
 <span className="font-medium text-emerald-700">{c.finalValue || "—"}</span>
 </span>
 <span className="shrink-0 text-[10px] text-stone-400">{c.store}</span>
 </div>
 ))}
 </div>
 </div>
 )}

 <p className="text-[11px] text-stone-400">True per-field accuracy: only fields the AI actually predicted are scored (fields sellers pre-typed are excluded). Each graded field is a labeled example — the dataset the eval harness will replay.</p>
 </div>
 )}
 </div>
 );
}
