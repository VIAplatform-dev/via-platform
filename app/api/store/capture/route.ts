import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny, isOwner } from "@/app/lib/storeAuth";
import { listCapturePaths, getCaptureOrigin, deleteCaptures } from "@/app/lib/site-capture-db";
import { getSellerBySlug } from "@/app/lib/db/sellers";
import { deleteAllItems } from "@/app/lib/db/inventory";
import { getStorefrontBySlug } from "@/app/lib/storefront-db";
import { runImportJob } from "@/app/lib/import-engine/wire";
import { createJob, getActiveJob, getLatestJob, getJob, saveJob } from "@/app/lib/import-engine/jobs-db";
import { describeError, isResumable, reportLine, type ImportJob } from "@/app/lib/import-engine/report";

// The captured site is served by the MARKETPLACE app (vyaplatform.com/site/{slug}) or the
// store's own connected domain — NOT the getvya.ai OS host the seller is viewing this from.
// Returning a relative "/site/{slug}" made "View your site" 404 (it opened on getvya.ai, which
// doesn't serve /site). Always return an absolute URL to where the site actually lives.
async function siteViewUrl(slug: string): Promise<string> {
 const sf = await getStorefrontBySlug(slug).catch(() => null); /* allow-swallow: cosmetic — the fallback URL below is always valid */
 const cd = (sf?.customDomain || "").replace(/^https?:\/\//, "").replace(/\/+$/, "").trim().toLowerCase();
 // Use a connected domain ONLY if it's a real external domain. A VYA host (or a bare
 // "vyaplatform.com" left in custom_domain) would send the seller to the marketplace
 // home instead of their captured site — fall through to /site/{slug} in that case.
 const isVyaHost = cd === "vyaplatform.com" || cd.endsWith(".vyaplatform.com") || cd === "getvya.ai" || cd.endsWith(".getvya.ai");
 if (cd && cd.includes(".") && !isVyaHost) return `https://${cd}`;
 return `https://vyaplatform.com/site/${slug}`;
}


export const dynamic = "force-dynamic";
export const maxDuration = 300; // a full-site crawl can take a couple minutes

/** Public shape of a job for the portal (steps + counts + readable warnings). */
function jobView(job: ImportJob) {
 return {
  id: job.id,
  status: job.status,
  url: job.url,
  steps: job.steps,
  counts: job.counts,
  warnings: job.warnings,
  report: reportLine(job.counts, job.warnings),
  resumable: isResumable(job),
  remaining: job.crawl?.queue.length ?? 0,
  error: job.error,
  updatedAt: job.updatedAt,
 };
}

// GET — capture status for the acting store, plus the latest import job so the portal can show
// progress while a crawl is still running (and resume it if the invocation died).
export async function GET(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const paths = await listCapturePaths(slug).catch(() => []); /* allow-swallow: status read — a DB blip shows "not captured yet", never a failed import */
 const origin = paths.length ? await getCaptureOrigin(slug).catch(() => null) : null; /* allow-swallow: display-only */
 const job = await getLatestJob(slug).catch(() => null); /* allow-swallow: the job record is additive; its absence must not break the capture status */
 // isAdmin gates the owner-only "reset to simple design + wipe inventory" action.
 // `url` is the ABSOLUTE public view URL (for "View your site"); `slug` lets the editor build a
 // SAME-ORIGIN /site/{slug} preview so it works on localhost / getvya.ai, not just prod.
 return NextResponse.json({
  captured: paths.length,
  url: paths.length ? await siteViewUrl(slug) : null,
  slug, origin, pages: paths,
  isAdmin: isOwner(request, slug),
  job: job ? jobView(job) : null,
 });
}

/** Run (or continue) a job to completion-or-pause, and shape the seller-facing response. */
async function execute(slug: string, job: ImportJob, replaceBlocks: boolean) {
 const r = await runImportJob(job, { replaceBlocks });

 if (r.status === "failed") {
  return NextResponse.json({ error: r.error || "Capture failed.", jobId: job.id, warnings: r.warnings }, { status: 502 });
 }

 const url = await siteViewUrl(slug);
 // Out of time with pages still queued. Nothing is lost — the browser resumes immediately, and the
 // sweeper cron picks it up if the seller closes the tab.
 if (r.status === "paused") {
  return NextResponse.json({
   ok: true, jobId: job.id, status: "paused", resumable: true,
   pages: r.counts.pages, items: r.counts.products, report: r.report, warnings: r.warnings,
   remaining: r.crawl?.queue.length ?? 0, steps: r.steps, url,
   note: `Still copying your site — ${r.counts.pages} pages so far.`,
  });
 }

 if (r.mode === "brand") {
  const found = r.steps.find((s) => s.name === "blocks")?.detail?.replace(/^brand storefront \(|\)$/g, "") || "branding";
  return NextResponse.json({
   ok: true, jobId: job.id, status: "done", mode: "brand", pages: 0, items: 0, url,
   report: r.report, warnings: r.warnings, steps: r.steps,
   note: `We couldn't copy this site's pages — it builds them in the browser. We've set up your VYA storefront using your ${found} instead. Add your inventory by uploading a CSV or connecting your store.`,
  });
 }

 // Password-protected? The crawl either reads nothing or only grabs the lock screen — don't host
 // that. Products still import (a connected store's API works behind a password).
 if (r.locked) {
  const base = "Your storefront looks password-protected, so we couldn’t capture its design. Remove the password (Shopify: Online Store → Preferences) and re-run to bring your exact site over.";
  if (r.counts.products > 0) {
   return NextResponse.json({ ok: true, jobId: job.id, status: "done", pages: 0, items: r.counts.products, url, report: r.report, warnings: r.warnings, steps: r.steps, note: `${base} (We did import your ${r.counts.products} products.)` });
  }
  return NextResponse.json({ error: `${base} Or connect your store above to import just your products.`, jobId: job.id, warnings: r.warnings }, { status: 400 });
 }

 return NextResponse.json({
  ok: true, jobId: job.id, status: "done",
  pages: r.counts.pages, items: r.counts.products, collections: r.counts.collections,
  report: r.report, warnings: r.warnings, steps: r.steps, url,
 });
}

// POST { url } — capture the seller's entire existing site and host every page on VYA.
// POST { resume: true } — continue an interrupted import where it stopped.
export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const body = await request.json().catch(() => null); /* allow-swallow: a malformed body is answered with 400 immediately below */
 // When the seller explicitly (re)imports their site — e.g. from onboarding — the block storefront
 // should BECOME that site, replacing any stale/starter blocks. Otherwise we only seed empty ones.
 const replaceBlocks = body?.replaceBlocks === true;

 try {
  // ── Resume an interrupted import ─────────────────────────────────────────────────────────────
  if (body?.resume === true || body?.jobId) {
   const job = body?.jobId ? await getJob(String(body.jobId)) : await getActiveJob(slug);
   if (!job || job.slug !== slug) return NextResponse.json({ error: "No import to resume." }, { status: 404 });
   if (!isResumable(job)) {
    return NextResponse.json({ ok: true, jobId: job.id, status: job.status, report: reportLine(job.counts, job.warnings), warnings: job.warnings, steps: job.steps, url: await siteViewUrl(slug) });
   }
   await saveJob(job.id, { status: "running" });
   return await execute(slug, job, replaceBlocks);
  }

  const url = body?.url ? String(body.url).trim() : "";
  if (!url) return NextResponse.json({ error: "Paste your site URL." }, { status: 400 });

  // One import per store at a time. A second request (an impatient double-click, or a re-import
  // while the sweeper is resuming) would otherwise run a parallel crawl over the same slug —
  // two crawlers writing the same pages, and the first one's deleteCaptures wiping the second's work.
  const active = await getActiveJob(slug);
  if (active) {
   return NextResponse.json({
    ok: true, jobId: active.id, status: active.status, alreadyRunning: true,
    report: reportLine(active.counts, active.warnings), warnings: active.warnings,
    steps: active.steps, pages: active.counts.pages, items: active.counts.products,
    note: "An import is already running for this store.",
   });
  }

  const job = await createJob(slug, url);
  return await execute(slug, job, replaceBlocks);
 } catch (e) {
  console.error("site capture error:", e);
  return NextResponse.json({ error: describeError(e, "Capture failed.") }, { status: 502 });
 }
}

// DELETE — discard the captured site so the storefront falls back to the simple
// template / section builder.
export async function DELETE(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 // Owner/admin only — this is a destructive reset, not a per-seller feature.
 if (!isOwner(request, slug)) return NextResponse.json({ error: "Owner only" }, { status: 403 });
 try {
  await deleteCaptures(slug);
  // Also wipe the inventory the capture imported, for a true clean slate.
  const seller = await getSellerBySlug(slug);
  const itemsDeleted = seller ? await deleteAllItems(seller.id) : 0;
  return NextResponse.json({ ok: true, itemsDeleted });
 } catch (e) {
  // A reset that half-worked must say so — the old code reported ok:true regardless, so a failed
  // wipe looked identical to a successful one.
  return NextResponse.json({ error: describeError(e, "Reset failed.") }, { status: 500 });
 }
}
