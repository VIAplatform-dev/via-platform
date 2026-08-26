// Persistence for import jobs — the record that makes an import visible and resumable.
//
// Raw neon + `CREATE TABLE IF NOT EXISTS` (same pattern as site-capture-db.ts) rather than a Drizzle
// migration: the table self-heals on first call, so deploying this needs no migration step and a
// rollback is a plain revert.
//
// The crawl state lives HERE, not in memory, because that's the whole point: a Vercel function that
// gets killed mid-crawl (maxDuration 300s, and a 95-page store takes longer) must leave enough
// behind for the next invocation to continue.
import { neon } from "@neondatabase/serverless";
import { emptyCounts, initialSteps, type CrawlState, type ImportJob, type JobCounts, type JobStatus, type Step } from "./report.ts";

function sql() {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) throw new Error("No database URL configured");
 return neon(url);
}

let ready = false;
async function ensure() {
 if (ready) return;
 const q = sql();
 await q`CREATE TABLE IF NOT EXISTS import_jobs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 store_slug TEXT NOT NULL,
 url TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'running',
 steps JSONB NOT NULL DEFAULT '[]'::jsonb,
 counts JSONB NOT NULL DEFAULT '{}'::jsonb,
 warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
 crawl JSONB,
 error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
 )`;
 // Finding "this store's latest job" and "every job that looks abandoned" are the only two queries.
 await q`CREATE INDEX IF NOT EXISTS import_jobs_slug_created_idx ON import_jobs (store_slug, created_at DESC)`;
 await q`CREATE INDEX IF NOT EXISTS import_jobs_status_updated_idx ON import_jobs (status, updated_at)`;
 ready = true;
}

type Row = {
 id: string; store_slug: string; url: string; status: string;
 steps: unknown; counts: unknown; warnings: unknown; crawl: unknown;
 error: string | null; created_at: string | Date; updated_at: string | Date;
};

const iso = (v: string | Date) => (v instanceof Date ? v.toISOString() : String(v));

function toJob(r: Row): ImportJob {
 return {
  id: r.id,
  slug: r.store_slug,
  url: r.url,
  status: r.status as JobStatus,
  steps: (Array.isArray(r.steps) ? r.steps : initialSteps()) as Step[],
  counts: { ...emptyCounts(), ...(r.counts && typeof r.counts === "object" ? (r.counts as JobCounts) : {}) },
  warnings: (Array.isArray(r.warnings) ? r.warnings : []) as string[],
  crawl: (r.crawl && typeof r.crawl === "object" ? (r.crawl as CrawlState) : null),
  error: r.error,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
 };
}

export async function createJob(slug: string, url: string): Promise<ImportJob> {
 await ensure();
 const rows = (await sql()`
 INSERT INTO import_jobs (store_slug, url, status, steps, counts, warnings)
 VALUES (${slug}, ${url}, 'running', ${JSON.stringify(initialSteps())}::jsonb, ${JSON.stringify(emptyCounts())}::jsonb, '[]'::jsonb)
 RETURNING *`) as Row[];
 return toJob(rows[0]);
}

export async function getJob(id: string): Promise<ImportJob | null> {
 await ensure();
 const rows = (await sql()`SELECT * FROM import_jobs WHERE id = ${id}::uuid LIMIT 1`) as Row[];
 return rows[0] ? toJob(rows[0]) : null;
}

/** The store's most recent job — what the portal polls to show progress. */
export async function getLatestJob(slug: string): Promise<ImportJob | null> {
 await ensure();
 const rows = (await sql()`SELECT * FROM import_jobs WHERE store_slug = ${slug} ORDER BY created_at DESC LIMIT 1`) as Row[];
 return rows[0] ? toJob(rows[0]) : null;
}

/** A job for this store that is still going (or waiting to be resumed), if any.
 *  Used to refuse a duplicate import rather than running two crawls over the same slug. */
export async function getActiveJob(slug: string): Promise<ImportJob | null> {
 await ensure();
 const rows = (await sql()`
 SELECT * FROM import_jobs
 WHERE store_slug = ${slug} AND status IN ('running', 'paused')
 ORDER BY created_at DESC LIMIT 1`) as Row[];
 return rows[0] ? toJob(rows[0]) : null;
}

export type JobPatch = {
 status?: JobStatus;
 steps?: Step[];
 counts?: JobCounts;
 warnings?: string[];
 crawl?: CrawlState | null;
 error?: string | null;
};

/** Write progress. Always bumps updated_at — that timestamp is how the sweeper tells a live crawl
 *  from one whose instance died. */
export async function saveJob(id: string, patch: JobPatch): Promise<void> {
 await ensure();
 await sql()`
 UPDATE import_jobs SET
 status = COALESCE(${patch.status ?? null}, status),
 steps = COALESCE(${patch.steps ? JSON.stringify(patch.steps) : null}::jsonb, steps),
 counts = COALESCE(${patch.counts ? JSON.stringify(patch.counts) : null}::jsonb, counts),
 warnings = COALESCE(${patch.warnings ? JSON.stringify(patch.warnings) : null}::jsonb, warnings),
 crawl = CASE WHEN ${patch.crawl !== undefined} THEN ${patch.crawl ? JSON.stringify(patch.crawl) : null}::jsonb ELSE crawl END,
 error = CASE WHEN ${patch.error !== undefined} THEN ${patch.error ?? null}::text ELSE error END,
 updated_at = now()
 WHERE id = ${id}::uuid`;
}

/**
 * Jobs whose instance died: still marked `running` but silent for longer than the stall window.
 * Claimed atomically (status flips to 'paused' in the same UPDATE that selects them) so two
 * overlapping sweeper runs can't both pick up the same job and crawl it twice.
 */
export async function claimStalledJobs(stallAfterMs: number, limit = 5): Promise<ImportJob[]> {
 await ensure();
 const cutoffSeconds = Math.floor(stallAfterMs / 1000);
 const rows = (await sql()`
 UPDATE import_jobs SET status = 'paused', updated_at = now()
 WHERE id IN (
  SELECT id FROM import_jobs
  WHERE status = 'running' AND updated_at < now() - make_interval(secs => ${cutoffSeconds})
  ORDER BY updated_at ASC LIMIT ${limit}
  FOR UPDATE SKIP LOCKED
 )
 RETURNING *`) as Row[];
 return rows.map(toJob);
}

/** Paused jobs waiting for someone to continue them (the sweeper's second duty). */
export async function listPausedJobs(limit = 5): Promise<ImportJob[]> {
 await ensure();
 const rows = (await sql()`
 SELECT * FROM import_jobs WHERE status = 'paused' ORDER BY updated_at ASC LIMIT ${limit}`) as Row[];
 return rows.map(toJob);
}

/** Test/admin cleanup — remove a store's job history. */
export async function deleteJobs(slug: string): Promise<void> {
 await ensure();
 await sql()`DELETE FROM import_jobs WHERE store_slug = ${slug}`;
}
