"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, PageHeader, Button, inputCls } from "../ui";
import { useStoreBase } from "../nav-base";

// "Bring your site over" — capture the seller's existing site (every page,
// pixel-for-pixel) and host it on VYA, then swap in VYA's commerce backend.
// Sellers with NO existing site build one from the Storefront builder instead.
// Import is a ONE-TIME step: once a seller has a captured site, re-importing would
// re-crawl and discard their edits, so it's blocked for them (kept for admin testing).
//
// A big store's crawl outlives a single serverless invocation, so an import that stops
// half-way is expected, not exceptional. The job keeps its place server-side; this page
// polls it, shows progress while it runs, and asks the server to continue where it
// stopped. A seller who closes the tab is covered by the sweeper cron instead.

type Step = { name: string; status: string; detail?: string; warning?: string; ms?: number };
type Job = {
 id: string; status: string; report: string; warnings: string[]; steps: Step[];
 counts: { pages: number; products: number; collections: number };
 resumable: boolean; remaining: number; error: string | null;
};

// What each step is called in front of a seller (never the internal step name).
const STEP_LABEL: Record<string, string> = {
 crawl: "Copying your pages",
 products: "Importing your products",
 collections: "Creating your collections",
 membership: "Filing products into collections",
 blocks: "Rebuilding your homepage in the editor",
 checks: "Checking everything came over",
};

/** The one-line "what's happening right now" the seller sees while an import runs. */
function liveLine(job: Job | null): string {
 if (!job) return "Starting…";
 const running = job.steps.find((s) => s.status === "running");
 const pages = job.counts?.pages || 0;
 if (running?.name === "crawl") return `Copying your pages — ${pages} so far`;
 if (running) return STEP_LABEL[running.name] || "Working…";
 if (job.status === "paused") return `Picking up where it stopped — ${pages} pages so far`;
 return "Working…";
}

const MAX_RESUMES = 40; // a hard stop, so a job that can't progress can't loop forever

export default function BringYourSitePage() {
 const base = useStoreBase();
 // Arriving from onboarding after a failed import? The reason and the URL ride in on the query
 // string — read them as INITIAL state rather than setting state from an effect (which would
 // trigger a second render pass for something known before the first one).
 const qp = (k: string) => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(k));
 const [capUrl, setCapUrl] = useState(() => qp("url") || "");
 const [capBusy, setCapBusy] = useState(false);
 const [capErr, setCapErr] = useState<string | null>(() => qp("err"));
 const [capResult, setCapResult] = useState<{ pages: number; url: string; report?: string; warnings?: string[]; note?: string } | null>(null);
 const [job, setJob] = useState<Job | null>(null);
 const [status, setStatus] = useState<{ loaded: boolean; captured: number; isAdmin: boolean; url: string | null }>({ loaded: false, captured: 0, isAdmin: false, url: null });
 const busyRef = useRef(false);

 const readStatus = useCallback(async () => {
  const r = await fetch("/api/store/capture");
  if (!r.ok) return null;
  const d = await r.json();
  setStatus({ loaded: true, captured: d?.captured || 0, isAdmin: !!d?.isAdmin, url: d?.url || null });
  if (d?.job) setJob(d.job as Job);
  return d;
 }, []);

 // Initial load. Inlined rather than calling readStatus() straight from the effect body so state
 // is only ever set from a callback (matches the other portal pages).
 useEffect(() => {
  fetch("/api/store/capture")
   .then((r) => (r.ok ? r.json() : null))
   .then((d) => {
    setStatus({ loaded: true, captured: d?.captured || 0, isAdmin: !!d?.isAdmin, url: d?.url || null });
    if (d?.job) setJob(d.job as Job);
   })
   .catch(() => setStatus((s) => ({ ...s, loaded: true })));
 }, []);

 // Poll while an import is in flight so the seller sees it moving rather than a frozen spinner.
 useEffect(() => {
  if (!capBusy) return;
  const t = setInterval(() => { readStatus().catch(() => {}); }, 3000);
  return () => clearInterval(t);
 }, [capBusy, readStatus]);

 /** POST once, and keep asking the server to continue while it reports more work to do. */
 async function drive(body: Record<string, unknown>) {
  let d: Record<string, unknown> | null = null;
  for (let i = 0; i < MAX_RESUMES; i++) {
   let r: Response;
   try {
    r = await fetch("/api/store/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(i === 0 ? body : { resume: true }) });
   } catch {
    // The request died (a killed invocation, a dropped connection). That is NOT proof the import
    // failed — the job keeps its own state — so ask the server what actually happened before
    // telling the seller anything. Reporting "Capture failed" here was exactly the confusion
    // this milestone exists to remove.
    const s = await readStatus().catch(() => null);
    const j = (s?.job || null) as Job | null;
    if (j && (j.status === "running" || j.status === "paused") && j.resumable) continue;
    throw new Error("Couldn’t bring that site over.");
   }
   d = await r.json().catch(() => null);
   if (!r.ok) throw new Error((d?.error as string) || "Couldn’t bring that site over.");
   await readStatus().catch(() => {});
   if (d?.status !== "paused") return d;
  }
  return d;
 }

 async function bringSiteOver(resume = false) {
  if (!resume && !capUrl.trim()) return;
  if (busyRef.current) return;
  busyRef.current = true;
  setCapBusy(true); setCapErr(null); setCapResult(null);
  try {
   const d = await drive(resume ? { resume: true } : { url: capUrl });
   if (d) {
    setCapResult({
     pages: Number(d.pages) || 0,
     url: String(d.url || ""),
     report: d.report as string | undefined,
     warnings: (d.warnings as string[]) || [],
     note: d.note as string | undefined,
    });
   }
  } catch (e) {
   setCapErr(e instanceof Error ? e.message : "Couldn’t bring that site over.");
  }
  busyRef.current = false;
  setCapBusy(false);
 }

 const alreadyImported = status.loaded && status.captured > 0 && !status.isAdmin && !capResult;
 // An import left half-finished (tab closed, instance killed). The sweeper will get to it, but the
 // seller shouldn't have to wait for a cron if they're looking right at it.
 const interrupted = !capBusy && !capResult && job && job.resumable;

 return (
  <div className="mx-auto max-w-2xl px-6 py-10 sm:px-8">
   <PageHeader title="Bring your site over" subtitle="We host your exact site — every page, pixel-for-pixel — on VYA, then switch the backend to VYA commerce. Keep your design; swap Shopify." />

   {alreadyImported ? (
    // One-time import already done — send them to editing, not a re-crawl.
    <Card className="border-emerald-200 bg-emerald-50/40 p-6">
     <p className="text-[15px] font-semibold text-emerald-800">Your site is already on VYA</p>
     <p className="mt-1 text-[13px] text-stone-600">You brought your site over — edit any page (text, photos, and section order) from your storefront. Importing is a one-time step, so it won’t re-crawl and undo your edits.</p>
     <div className="mt-4 flex flex-wrap gap-2">
      <Button onClick={() => { window.location.href = `${base}/storefront`; }}>Edit your pages</Button>
      {status.url && <Button variant="secondary" onClick={() => { window.open(status.url as string, "_blank"); }}>View your site ↗</Button>}
     </div>
    </Card>
   ) : capResult ? (
    <Card className="border-emerald-200 bg-emerald-50/40 p-6">
     <p className="text-[15px] font-semibold text-emerald-800">Your site is live on VYA</p>
     {/* The report is the point of this milestone: what actually came over, in one line. */}
     <p className="mt-1 text-[13px] text-stone-600">{capResult.report || `${capResult.pages} pages captured.`}</p>
     {capResult.note && <p className="mt-2 text-[13px] text-stone-600">{capResult.note}</p>}
     {!!capResult.warnings?.length && (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
       <p className="text-[12px] font-semibold text-amber-800">{capResult.warnings.length === 1 ? "One thing to know" : `${capResult.warnings.length} things to know`}</p>
       <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12px] text-stone-700">
        {capResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
       </ul>
      </div>
     )}
     <div className="mt-4 flex flex-wrap gap-2">
      <Button onClick={() => { window.location.href = `${base}/storefront`; }}>Edit your pages</Button>
      <Button variant="secondary" onClick={() => { window.open(capResult.url, "_blank"); }}>View your site ↗</Button>
      {status.isAdmin && <Button variant="secondary" onClick={() => { setCapResult(null); setCapUrl(""); setJob(null); }}>Bring another (admin)</Button>}
     </div>
    </Card>
   ) : (
    <Card className="p-6">
     {status.isAdmin && status.captured > 0 && <p className="mb-3 text-[12px] text-amber-700">Admin: this store already has a captured site — re-importing replaces it and discards edits.</p>}
     {interrupted && (
      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
       <p className="text-[12px] text-amber-800">An earlier import stopped part-way ({job!.counts.pages} pages copied, {job!.remaining} to go). It resumes on its own shortly — or continue it now.</p>
       <Button className="mt-2" onClick={() => bringSiteOver(true)}>Continue import</Button>
      </div>
     )}
     <div className="flex gap-2">
      <input className={inputCls} value={capUrl} onChange={(e) => setCapUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && bringSiteOver()} placeholder="yourstore.com" disabled={capBusy} />
      <Button className="shrink-0" onClick={() => bringSiteOver()} disabled={capBusy || !capUrl.trim()}>{capBusy ? "Bringing it over…" : "Bring my site over"}</Button>
     </div>
     {capBusy && (
      <div className="mt-2.5">
       {/* Live, not a static "this takes a minute" — a stalled import used to look identical to a working one. */}
       <p className="text-[12px] text-stone-600">{liveLine(job)}</p>
       <p className="mt-0.5 text-[11px] text-stone-400">Copying every page and importing your products — this takes a minute or two. You can leave this page; it keeps going.</p>
      </div>
     )}
     {capErr && <p className="mt-2.5 text-xs text-red-600">{capErr}</p>}
    </Card>
   )}

   {!alreadyImported && <p className="mt-4 text-xs text-stone-400">No site yet? Build one from <a href={`${base}/storefront`} className="text-stone-600 underline hover:text-stone-900">Storefront</a>.</p>}
  </div>
 );
}
