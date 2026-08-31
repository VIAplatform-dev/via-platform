// The shape of an import, and how it reports itself.
//
// Everything here is PURE — no database, no network — so the step machine, the resume decision and
// the seller-facing report string can be unit tested directly (`node --test`). The database side
// lives in jobs-db.ts and the orchestration in run-import.ts.
//
// Why this exists at all: every step of an import used to swallow its own errors and return zeros
// (`.catch(() => ({ added: 0, … }))`), so a total failure and a store with no new products produced
// the SAME response. A seller learned their import had failed by complaining. A step now records
// what happened — including that it failed — and the job carries that record.

/** The ordered steps of an import. `crawl` is the only resumable one (it's the long pole). */
export const STEP_NAMES = ["crawl", "products", "collections", "membership", "blocks", "checks"] as const;
export type StepName = (typeof STEP_NAMES)[number];

/** `partial` = ran out of time budget but saved its progress; the job can be resumed. */
export type StepStatus = "pending" | "running" | "done" | "partial" | "failed" | "skipped";

export type Step = {
 name: StepName;
 status: StepStatus;
 /** Human-readable outcome ("42 pages", "318 products · 12 updated"). */
 detail?: string;
 /** Why it failed / what was lost. Surfaces to the seller — keep it readable, not a stack trace. */
 warning?: string;
 ms?: number;
};

export type JobStatus = "running" | "paused" | "done" | "failed" | "stalled";

export type JobCounts = { pages: number; products: number; collections: number };

/** Crawl progress, persisted so an interrupted import resumes instead of restarting. */
export type CrawlState = {
 /** Paths not yet fetched. */
 queue: string[];
 /** Paths already attempted (fetched or skipped) — never re-fetched on resume. */
 done: string[];
 /** Paths successfully stored. */
 paths: string[];
};

export type ImportJob = {
 id: string;
 slug: string;
 url: string;
 status: JobStatus;
 steps: Step[];
 counts: JobCounts;
 warnings: string[];
 crawl: CrawlState | null;
 /** Bumped every time the job makes progress; the sweeper uses it to spot a dead instance. */
 updatedAt: string;
 createdAt: string;
 error: string | null;
};

/** A fresh step list — every step pending. */
export function initialSteps(): Step[] {
 return STEP_NAMES.map((name) => ({ name, status: "pending" as StepStatus }));
}

export function emptyCounts(): JobCounts {
 return { pages: 0, products: 0, collections: 0 };
}

/** Replace one step, preserving order. Returns a new array (never mutates). */
export function withStep(steps: Step[], name: StepName, patch: Partial<Omit<Step, "name">>): Step[] {
 const next = steps.map((s) => (s.name === name ? { ...s, ...patch } : s));
 // A step the caller invented (shouldn't happen, but don't silently drop it).
 if (!next.some((s) => s.name === name)) next.push({ name, status: "pending", ...patch });
 return next;
}

export function getStep(steps: Step[], name: StepName): Step | null {
 return steps.find((s) => s.name === name) ?? null;
}

/** Every warning across the job, in step order, deduplicated. */
export function collectWarnings(steps: Step[], extra: string[] = []): string[] {
 const out: string[] = [];
 for (const s of steps) if (s.warning) out.push(s.warning);
 for (const w of extra) out.push(w);
 return [...new Set(out.filter((w) => w && w.trim()))];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The one-line report a seller sees: `42 pages · 318 products · 18 collections · 2 warnings`.
 *
 * Zero counts are kept (not hidden) — "0 products" is exactly the signal that something went wrong
 * and is the thing that used to be indistinguishable from success. Warnings appear only when there
 * are any, so a clean import reads clean.
 */
export function reportLine(counts: JobCounts, warnings: string[]): string {
 const parts = [plural(counts.pages, "page"), plural(counts.products, "product"), plural(counts.collections, "collection")];
 if (warnings.length) parts.push(plural(warnings.length, "warning"));
 return parts.join(" · ");
}

/**
 * Can this job be picked up and carried forward?
 *
 * Yes whenever it is in a non-terminal state AND the crawl got far enough to leave state behind.
 * Note this is NOT just "pages still queued": an import whose crawl finished but whose product
 * import was killed still has real work left, and treating it as unresumable would mark a job
 * failed while its store sat half-imported. The later steps are all idempotent (products match on
 * source identity), so re-running them is safe.
 *
 * A job killed before the crawl produced anything has nothing to resume — a retry is a fresh import.
 */
export function isResumable(job: Pick<ImportJob, "status" | "crawl">): boolean {
 if (job.status !== "paused" && job.status !== "running" && job.status !== "stalled") return false;
 return job.crawl !== null;
}

/** True when a resume would have to re-enter the crawler (rather than just finish the later steps). */
export function hasQueuedPages(job: Pick<ImportJob, "crawl">): boolean {
 return Boolean(job.crawl && job.crawl.queue.length > 0);
}

/** How long a `running` job may go without an update before the sweeper treats it as abandoned.
 *  Comfortably longer than one function invocation (maxDuration 300s) so a live crawl is never
 *  mistaken for a dead one. */
export const STALL_AFTER_MS = 8 * 60 * 1000;

export function isStalled(job: Pick<ImportJob, "status" | "updatedAt">, now = Date.now()): boolean {
 if (job.status !== "running") return false;
 const t = Date.parse(job.updatedAt);
 if (!Number.isFinite(t)) return false;
 return now - t > STALL_AFTER_MS;
}

/** Turn a thrown value into a readable, seller-facing sentence. Never a stack trace. */
export function describeError(e: unknown, fallback = "Something went wrong."): string {
 if (e instanceof Error && e.message) return e.message;
 if (typeof e === "string" && e.trim()) return e.trim();
 return fallback;
}
