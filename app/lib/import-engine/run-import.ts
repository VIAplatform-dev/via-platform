// The import pipeline: run the steps, record what each one did, resume where a killed invocation
// stopped. This is the milestone that replaces silence with a report.
//
// Every dependency is INJECTED (the `ImportDeps` record) rather than imported directly, so the step
// machine — ordering, which failures are fatal, what resumes, what a warning says — is unit tested
// with fakes and no database, no network, no store. The real wiring lives in the route.
//
// The rule this file enforces: a step that fails says so. Nothing here returns zeros on failure and
// lets the caller mistake it for an empty store, which is exactly how the deleted header, the empty
// collections and the unlinked collections all stayed invisible until someone happened to look.

import {
 collectWarnings, describeError, emptyCounts, getStep, initialSteps, reportLine, withStep,
 type CrawlState, type ImportJob, type JobCounts, type Step, type StepName,
} from "./report.ts";

export type ProductLike = { name?: string | null; sourceId?: string | null };

export type CrawlOutcome = {
 pages: number;
 paths: string[];
 complete: boolean;
 state: CrawlState;
 failed: { path: string; error: string }[];
 /** Non-fatal problems with the crawl itself (e.g. custom CSS that couldn't be preserved). */
 warnings?: string[];
};

/** `warnings` carries partial failures the importer survived (a product that wouldn't save, an
 *  order-history read that failed) — degradations that must still reach the seller. */
export type ImportStatsLike = { added: number; updated: number; unchanged: number; skipped: number; removed: number; warnings?: string[] };

export type ImportDeps<P extends ProductLike = ProductLike> = {
 crawl: (args: { slug: string; url: string; maxPages: number; resume: CrawlState | null; budgetMs: number; onProgress: (s: CrawlState) => Promise<void> }) => Promise<CrawlOutcome>;
 /** Products from a connected store's API, else the public feed. */
 pullProducts: (slug: string, url: string) => Promise<P[]>;
 importItems: (slug: string, products: P[]) => Promise<ImportStatsLike>;
 /** Pre-create VYA collections mirroring captured /collections/{handle} pages. Returns how many. */
 ensureCollections: (slug: string, paths: string[]) => Promise<number>;
 /** Put imported items INTO those collections. */
 syncMembership: (slug: string, url: string, products: P[]) => Promise<{ collections: number; links: number; warnings?: string[] }>;
 /** Seed the visual studio with the real homepage as blocks. Returns how many blocks landed. */
 importBlocks: (slug: string, url: string, replaceBlocks: boolean) => Promise<number>;
 /** Structural fidelity checks over what was captured (checks.ts). Returns seller-facing warnings. */
 checkCapture: (slug: string, paths: string[]) => Promise<string[]>;
 /** Build a storefront from the brand when a site can't be crawled (Wix/SPA). Null if that fails. */
 buildBrandStorefront: (slug: string, url: string) => Promise<{ found: string[] } | null>;
 /** Is the captured homepage a password lock screen? */
 isLocked: (slug: string, pages: number) => Promise<boolean>;
 /** Persist job progress. Called after every step and throughout the crawl. */
 save: (patch: { status?: ImportJob["status"]; steps?: Step[]; counts?: JobCounts; warnings?: string[]; crawl?: CrawlState | null; error?: string | null }) => Promise<void>;
};

export type RunOpts = {
 maxPages?: number;
 /** Leave headroom under the platform's function limit so the run stops cleanly and marks itself
  *  resumable, instead of being killed mid-page with the browser getting a 504. */
 budgetMs?: number;
 replaceBlocks?: boolean;
};

export type RunOutcome = {
 status: ImportJob["status"];
 steps: Step[];
 counts: JobCounts;
 warnings: string[];
 crawl: CrawlState | null;
 report: string;
 /** `brand` = the site couldn't be copied and we built from its branding instead. */
 mode: "site" | "brand";
 /** Set when the store is password-protected — the caller turns this into seller guidance. */
 locked: boolean;
 error: string | null;
};

// The crawl stops at 180s of the platform's 300s function limit, leaving ~2 minutes for the steps
// that follow it (products, collections, membership, blocks, checks). Overrunning is now
// recoverable — a resume picks up after a completed crawl — but it costs the seller a round trip,
// so the budget is set to avoid it rather than rely on it.
// maxPages is a backstop, not the pacing mechanism — budgetMs (with its resume loop) is. Keep this
// high enough that a real store's catalog is never the thing that truncates a crawl (see wire.ts).
const DEFAULTS = { maxPages: 3000, budgetMs: 180_000 };

/**
 * Run (or resume) an import.
 *
 * Fatal vs. warning: only the crawl and an outright password lock stop an import. Everything
 * else — products, collections, membership, studio blocks, fidelity checks — degrades to a warning,
 * because a store whose design copied fine but whose collections didn't link is a partial success
 * worth keeping, and the seller needs to be TOLD which half failed.
 */
export async function runImport<P extends ProductLike>(
 job: Pick<ImportJob, "slug" | "url" | "steps" | "counts" | "crawl">,
 deps: ImportDeps<P>,
 opts: RunOpts = {},
): Promise<RunOutcome> {
 const maxPages = opts.maxPages ?? DEFAULTS.maxPages;
 const budgetMs = opts.budgetMs ?? DEFAULTS.budgetMs;
 const { slug, url } = job;

 let steps = job.steps?.length ? job.steps : initialSteps();
 let counts: JobCounts = { ...emptyCounts(), ...(job.counts || {}) };
 const extraWarnings: string[] = [];
 let crawlState: CrawlState | null = job.crawl ?? null;

 const persist = async (status?: ImportJob["status"]) =>
  deps.save({ status, steps, counts, warnings: collectWarnings(steps, extraWarnings), crawl: crawlState });

 /** Run one step, recording duration and outcome. `fatal` steps abort the import; the rest warn. */
 async function step<T>(
  name: StepName,
  fn: () => Promise<T>,
  o: { detail: (v: T) => string; warnOnFail: (msg: string) => string; fatal?: boolean },
 ): Promise<T | null> {
  const t0 = Date.now();
  steps = withStep(steps, name, { status: "running" });
  await persist();
  try {
   const v = await fn();
   steps = withStep(steps, name, { status: "done", detail: o.detail(v), ms: Date.now() - t0 });
   await persist();
   return v;
  } catch (e) {
   const msg = describeError(e);
   steps = withStep(steps, name, { status: "failed", warning: o.warnOnFail(msg), ms: Date.now() - t0 });
   await persist();
   if (o.fatal) throw e;
   return null;
  }
 }

 const finish = (status: ImportJob["status"], mode: RunOutcome["mode"], locked: boolean, error: string | null): RunOutcome => {
  const warnings = collectWarnings(steps, extraWarnings);
  return { status, steps, counts, warnings, crawl: crawlState, report: reportLine(counts, warnings), mode, locked, error };
 };

 // ── 1. Crawl (resumable, the long pole) ───────────────────────────────────────────────────────
 // A job can also be resumed AFTER its crawl finished (the invocation died during the product
 // import, say). Re-entering the crawler then would be destructive, not merely wasteful: a fresh
 // crawl starts by DELETING the store's captured pages. So when the saved state shows the crawl
 // already completed, carry it forward and pick up at the next step instead.
 const priorCrawl = getStep(steps, "crawl");
 const crawlAlreadyDone = crawlState !== null && crawlState.queue.length === 0 && priorCrawl?.status === "done";

 let crawl: CrawlOutcome | null = crawlAlreadyDone
  ? { pages: crawlState!.paths.length, paths: crawlState!.paths, complete: true, state: crawlState!, failed: [], warnings: [] }
  : null;
 try {
  if (!crawlAlreadyDone) crawl = await step(
   "crawl",
   () => deps.crawl({
    slug, url, maxPages,
    resume: crawlState,
    budgetMs,
    onProgress: async (s) => { crawlState = s; counts = { ...counts, pages: s.paths.length }; await persist("running"); },
   }),
   {
    detail: (r) => `${r.pages} page${r.pages === 1 ? "" : "s"}${r.complete ? "" : " so far"}`,
    warnOnFail: (m) => `We couldn’t copy your site: ${m}`,
    fatal: true,
   },
  );
 } catch (e) {
  await deps.save({ status: "failed", steps, counts, warnings: collectWarnings(steps, extraWarnings), crawl: crawlState, error: describeError(e) });
  return finish("failed", "site", false, describeError(e));
 }
 if (!crawl) return finish("failed", "site", false, "Capture failed.");

 crawlState = crawl.state;
 counts = { ...counts, pages: crawl.pages };
 if (crawl.warnings?.length) extraWarnings.push(...crawl.warnings);
 // Pages that wouldn't load used to vanish into `catch {}`. Report them — capped, so a store with
 // 60 broken pages produces a readable warning rather than 60 of them.
 if (crawl.failed.length) {
  const shown = crawl.failed.slice(0, 3).map((f) => f.path).join(", ");
  const more = crawl.failed.length > 3 ? ` and ${crawl.failed.length - 3} more` : "";
  extraWarnings.push(`${crawl.failed.length} page${crawl.failed.length === 1 ? "" : "s"} couldn’t be copied (${shown}${more}).`);
 }

 // Out of time with pages still queued: stop cleanly and stay resumable. Nothing is lost — the
 // browser and the sweeper cron both know how to continue a paused job.
 if (!crawl.complete) {
  steps = withStep(steps, "crawl", { status: "partial", detail: `${crawl.pages} pages so far` });
  await persist("paused");
  return finish("paused", "site", false, null);
 }

 // ── 2. A site that can't be copied → build from its branding instead ──────────────────────────
 if (crawl.pages <= 1) {
  const built = await step("blocks", () => deps.buildBrandStorefront(slug, url), {
   detail: (b) => (b ? `brand storefront (${b.found.join(", ")})` : "no brand signal"),
   warnOnFail: (m) => `We couldn’t build a storefront from your branding: ${m}`,
  });
  if (built) {
   for (const n of ["products", "collections", "membership", "checks"] as StepName[]) steps = withStep(steps, n, { status: "skipped" });
   await persist("done");
   return finish("done", "brand", false, null);
  }
 }

 // ── 3. Products ───────────────────────────────────────────────────────────────────────────────
 // A failure here is NOT fatal — the design capture already succeeded and is worth keeping — but it
 // is loudly reported, because "0 products" and "the product import crashed" must never look alike.
 const products = await step("products", async () => {
  const pulled = await deps.pullProducts(slug, url);
  const stats = await deps.importItems(slug, pulled);
  return { pulled, stats };
 }, {
  detail: ({ pulled, stats }) => {
   const total = stats.added + stats.updated + stats.unchanged;
   const bits = [`${total} product${total === 1 ? "" : "s"}`];
   if (stats.added) bits.push(`${stats.added} new`);
   if (stats.updated) bits.push(`${stats.updated} updated`);
   if (stats.removed) bits.push(`${stats.removed} no longer listed`);
   if (!pulled.length) bits.push("none found on the source");
   return bits.join(" · ");
  },
  warnOnFail: (m) => `We copied your site but couldn’t import your products: ${m}`,
 });
 if (products) {
  const { stats } = products;
  counts = { ...counts, products: stats.added + stats.updated + stats.unchanged };
  // Partial failures the importer survived (an unsaveable listing, an unreadable order history).
  if (stats.warnings?.length) extraWarnings.push(...stats.warnings);
  if (!products.pulled.length) {
   extraWarnings.push("We couldn’t read any products from your store — upload a CSV or connect your platform to bring your inventory over.");
  }
 }

 // ── 4. Collections, then membership ───────────────────────────────────────────────────────────
 const made = await step("collections", () => deps.ensureCollections(slug, crawl.paths), {
  detail: (n) => `${n} collection${n === 1 ? "" : "s"}`,
  warnOnFail: (m) => `Your collections couldn’t be created: ${m}`,
 });
 if (made != null) counts = { ...counts, collections: made };

 // Without this the collections stay empty and every captured collection page silently falls back
 // to the frozen source grid — the exact failure this milestone exists to make visible.
 const membership = await step("membership", () => deps.syncMembership(slug, url, products?.pulled ?? ([] as P[])), {
  detail: (m) => `${m.links} item${m.links === 1 ? "" : "s"} across ${m.collections} collection${m.collections === 1 ? "" : "s"}`,
  warnOnFail: (m) => `We couldn’t file your products into their collections: ${m}`,
 });
 if (membership?.warnings?.length) extraWarnings.push(...membership.warnings);
 if (membership && counts.collections > 0 && membership.links === 0) {
  extraWarnings.push("None of your products could be matched to a collection, so collection pages will show your newest items instead.");
 }

 // ── 5. Studio blocks ──────────────────────────────────────────────────────────────────────────
 await step("blocks", () => deps.importBlocks(slug, url, opts.replaceBlocks === true), {
  detail: (n) => (n > 0 ? `${n} section${n === 1 ? "" : "s"}` : "kept existing design"),
  warnOnFail: (m) => `We couldn’t rebuild your homepage in the editor: ${m}`,
 });

 // ── 6. Structural checks — did the copy actually come out right? ───────────────────────────────
 const checkWarnings = await step("checks", () => deps.checkCapture(slug, crawl.paths), {
  detail: (w) => (w.length ? `${w.length} issue${w.length === 1 ? "" : "s"} found` : "nav, grids and collections look right"),
  warnOnFail: (m) => `We couldn’t verify the copied pages: ${m}`,
 });
 if (checkWarnings) extraWarnings.push(...checkWarnings);

 // ── 7. Password-protected stores ──────────────────────────────────────────────────────────────
 let locked = false;
 try {
  locked = await deps.isLocked(slug, crawl.pages);
 } catch (e) {
  extraWarnings.push(`We couldn’t check whether your store is password-protected: ${describeError(e)}`);
 }
 await persist("done");
 return finish("done", "site", locked, null);
}
