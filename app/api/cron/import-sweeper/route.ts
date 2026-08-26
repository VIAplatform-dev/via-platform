import { NextRequest, NextResponse } from "next/server";
import { claimStalledJobs, listPausedJobs, saveJob } from "@/app/lib/import-engine/jobs-db";
import { isResumable, describeError, STALL_AFTER_MS, type ImportJob } from "@/app/lib/import-engine/report";
import { resumeImportJob } from "@/app/lib/import-engine/wire";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// Imports that nobody is watching.
//
// A crawl of a big store outlives a single function invocation (maxDuration 300s; one store in the
// corpus is 95 pages / 51 MB), so an import stopping half-way is normal, not exceptional. The
// seller's browser resumes it while their tab is open — this is the backstop for when it isn't:
// they closed the laptop, or the instance died mid-crawl and nothing marked the job finished.
//
// Two duties:
//   1. Claim jobs still marked `running` that have gone silent past the stall window (their instance
//      is gone) and flip them to `paused` — done atomically in SQL so two overlapping sweeps can't
//      both grab the same job.
//   2. Continue `paused` jobs that still have queued pages.
//
// Bounded per run: one job per sweep, because a resume is itself a full-length crawl invocation.
export async function GET(request: NextRequest) {
 if (process.env.CRON_SECRET && request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }
 try {
  // 1. Abandoned `running` jobs → paused (so they become resumable).
  const stalled = await claimStalledJobs(STALL_AFTER_MS);
  for (const j of stalled) {
   if (!isResumable(j)) {
    // Silent and nothing left to do: it died after the crawl, so close it out rather than leaving
    // a job that looks perpetually in-progress in the seller's portal.
    await saveJob(j.id, { status: "failed", error: "The import stopped unexpectedly and couldn’t be continued." });
   }
  }

  // 2. Continue one paused job that still has work.
  const paused = (await listPausedJobs(10)).filter(isResumable);
  const next: ImportJob | undefined = paused[0];
  if (!next) {
   return NextResponse.json({ ok: true, stalled: stalled.length, resumed: 0 });
  }

  const r = await resumeImportJob(next);
  console.log(`[import-sweeper] resumed ${next.slug} job ${next.id} → ${r.status} (${r.report})`);
  return NextResponse.json({ ok: true, stalled: stalled.length, resumed: 1, job: next.id, slug: next.slug, status: r.status, report: r.report });
 } catch (e) {
  return NextResponse.json({ error: describeError(e, "sweep failed") }, { status: 500 });
 }
}
