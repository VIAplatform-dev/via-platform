"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type FieldAccuracy = { field: string; accepted: number; corrected: number; accuracyPct: number };
type BrandMiss = { from: string; to: string; n: number };
type PriceCalibration = { samples: number; medianRatio: number; overpricedPct: number; underpricedPct: number; avgAbsErrorPct: number };
type SegmentStat = { category: string; publishes: number; priced: number; medianRatio: number | null; offPct: number | null; avgErrorPct: number | null };
type CorrectionRow = { field: string; aiValue: string | null; finalValue: string | null; imageUrl: string | null; store: string; at: string };
type Data = {
 periodDays: number;
 totalPublishes: number;
 totalCorrections: number;
 fields: FieldAccuracy[];
 topBrandMisses: BrandMiss[];
 price: PriceCalibration;
 segments: SegmentStat[];
 corrections: CorrectionRow[];
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

type TrainingStats = { total: number; bySource: { source: string; count: number; withBrand: number; withPrice: number; withImage: number }[] };
type EvalResult = { sample: number; withReverseImage: boolean; fields: { field: string; correct: number; total: number; pct: number }[]; price?: { within20: number; total: number; pct: number }; misses: { field: string; image: string; guessed: string | null; truth: string }[] };
type EvalRun = { ranAt: string; sample: number; brandPct: number | null; eraPct: number | null; categoryPct: number | null; pricePct: number | null };
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

 const price = data?.price;
 // Calibration verdict from the median final ÷ market ratio.
 const cal = !price || price.samples < 3 ? null
 : price.medianRatio >= 0.9 && price.medianRatio <= 1.1 ? { t: "Well calibrated", c: "text-emerald-600" }
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

 {/* Nightly exam history — auto-runs ~1 AM ET; watch the trend climb. */}
 {evalRuns.length > 0 && (
 <div className="mb-6 rounded-xl border border-stone-200 bg-white p-5">
 <p className="mb-1 text-[13px] font-medium text-stone-700">Nightly exams</p>
 <p className="mb-3 text-[11px] text-stone-400">Runs automatically around 1 AM ET. Compare mornings to see prompt changes move the numbers.</p>
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

 {/* Where pricing lands — by category (where it fails vs works) */}
 {data.segments && data.segments.length > 0 && (
 <div className="rounded-xl border border-stone-200 bg-white p-5">
 <p className="mb-1 text-[13px] font-medium text-stone-700">Where pricing lands — by category</p>
 <p className="mb-3 text-[11px] text-stone-400">Median of (seller’s final price ÷ AI’s market value) per category. 1.00× = on the money; far from it = the model is off there. This is where to aim next.</p>
 <div className="overflow-x-auto">
 <table className="w-full text-[12px]">
 <thead className="text-left text-[11px] uppercase tracking-wide text-stone-400">
 <tr><th className="py-1.5 pr-4 font-medium">Category</th><th className="py-1.5 pr-4 font-medium">Listings</th><th className="py-1.5 pr-4 font-medium">Priced</th><th className="py-1.5 pr-4 font-medium">Median</th><th className="py-1.5 pr-4 font-medium">Off &gt;20%</th><th className="py-1.5 font-medium">Avg err</th></tr>
 </thead>
 <tbody>
 {data.segments.map((s) => {
 const r = s.medianRatio;
 const c = r == null ? "text-stone-400" : r >= 0.9 && r <= 1.1 ? "text-emerald-600" : (r < 0.75 || r > 1.3) ? "text-red-600" : "text-amber-600";
 return (
 <tr key={s.category} className="border-t border-stone-100">
 <td className="py-1.5 pr-4 capitalize text-stone-700">{s.category}</td>
 <td className="py-1.5 pr-4 tabular-nums text-stone-500">{s.publishes}</td>
 <td className="py-1.5 pr-4 tabular-nums text-stone-500">{s.priced}</td>
 <td className={`py-1.5 pr-4 font-semibold tabular-nums ${c}`}>{r != null ? `${r.toFixed(2)}×` : "—"}</td>
 <td className="py-1.5 pr-4 tabular-nums text-stone-500">{s.offPct != null ? `${s.offPct}%` : "—"}</td>
 <td className="py-1.5 tabular-nums text-stone-500">{s.avgErrorPct != null ? `±${s.avgErrorPct}%` : "—"}</td>
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
