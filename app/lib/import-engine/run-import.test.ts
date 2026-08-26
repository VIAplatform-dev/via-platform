import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runImport, type CrawlOutcome, type ImportDeps } from "./run-import.ts";
import { collectWarnings, initialSteps, isResumable, isStalled, reportLine, withStep, type CrawlState, type Step } from "./report.ts";

// The step machine, tested with fakes — no database, no network, no store. What's asserted here is
// exactly what makes an import VISIBLE: that a failing step is reported rather than returning zeros,
// that an interrupted crawl resumes instead of restarting, and that the seller gets a readable line.

// ── The report line ─────────────────────────────────────────────────────────────────────────────

test("report line reads like the acceptance criterion", () => {
 assert.equal(
  reportLine({ pages: 42, products: 318, collections: 18 }, ["a", "b"]),
  "42 pages · 318 products · 18 collections · 2 warnings",
 );
});

test("report line pluralises, and hides warnings only when there are none", () => {
 assert.equal(reportLine({ pages: 1, products: 1, collections: 1 }, []), "1 page · 1 product · 1 collection");
 assert.equal(reportLine({ pages: 0, products: 0, collections: 0 }, ["x"]), "0 pages · 0 products · 0 collections · 1 warning");
});

test("zero counts are KEPT — '0 products' is the signal, not something to hide", () => {
 assert.match(reportLine({ pages: 12, products: 0, collections: 0 }, []), /0 products/);
});

test("warnings dedupe across steps and extras", () => {
 const steps = withStep(initialSteps(), "products", { status: "failed", warning: "same" });
 assert.deepEqual(collectWarnings(steps, ["same", "other", ""]), ["same", "other"]);
});

// ── Stall / resume predicates ───────────────────────────────────────────────────────────────────

test("a running job is stalled only after the stall window", () => {
 const now = Date.now();
 const at = (ms: number) => ({ status: "running" as const, updatedAt: new Date(now - ms).toISOString() });
 assert.equal(isStalled(at(60_000), now), false, "a live crawl mid-invocation is not stalled");
 assert.equal(isStalled(at(9 * 60_000), now), true);
 assert.equal(isStalled({ status: "done", updatedAt: new Date(now - 9 * 60_000).toISOString() }, now), false);
});

test("resumable means a non-terminal job that got far enough to leave state", () => {
 const crawl: CrawlState = { queue: ["/a"], done: [], paths: [] };
 assert.equal(isResumable({ status: "paused", crawl }), true);
 assert.equal(isResumable({ status: "done", crawl }), false);
});

// ── Fakes ───────────────────────────────────────────────────────────────────────────────────────

const crawlResult = (over: Partial<CrawlOutcome> = {}): CrawlOutcome => ({
 pages: 3, paths: ["/", "/collections/new", "/about"], complete: true,
 state: { queue: [], done: ["/", "/collections/new", "/about"], paths: ["/", "/collections/new", "/about"] },
 failed: [], warnings: [], ...over,
});

type Saved = { status?: string; steps?: Step[]; crawl?: CrawlState | null; error?: string | null };

function deps(over: Partial<ImportDeps> = {}) {
 const saves: Saved[] = [];
 const base: ImportDeps = {
  crawl: async () => crawlResult(),
  pullProducts: async () => [{ name: "A dress", sourceId: "a" }, { name: "A bag", sourceId: "b" }],
  importItems: async () => ({ added: 2, updated: 0, unchanged: 0, skipped: 0, removed: 0 }),
  ensureCollections: async () => 4,
  syncMembership: async () => ({ collections: 4, links: 9 }),
  importBlocks: async () => 6,
  checkCapture: async () => [],
  buildBrandStorefront: async () => ({ found: ["colours", "logo"] }),
  isLocked: async () => false,
  save: async (p) => { saves.push(p as Saved); },
  ...over,
 };
 return { deps: base, saves };
}

const job = (over: Partial<{ crawl: CrawlState | null; steps: Step[] }> = {}) => ({
 slug: "test-import", url: "https://example.com", steps: initialSteps(),
 counts: { pages: 0, products: 0, collections: 0 }, crawl: null, ...over,
});

// ── The pipeline ────────────────────────────────────────────────────────────────────────────────

test("a clean import reports every count and finishes done", async () => {
 const { deps: d } = deps();
 const r = await runImport(job(), d);
 assert.equal(r.status, "done");
 assert.deepEqual(r.counts, { pages: 3, products: 2, collections: 4 });
 assert.equal(r.warnings.length, 0, `unexpected warnings: ${r.warnings.join(" | ")}`);
 assert.equal(r.report, "3 pages · 2 products · 4 collections");
 assert.ok(r.steps.every((s) => s.status === "done"), "every step ran");
});

test("a failed PRODUCT import is reported, not silently zeroed", async () => {
 // The old code did `.catch(() => ({ added: 0, … }))` here, so a crash and an empty store produced
 // an identical response. The design capture is still worth keeping — but the seller must be told.
 const { deps: d } = deps({ importItems: async () => { throw new Error("database unreachable"); } });
 const r = await runImport(job(), d);
 assert.equal(r.status, "done", "the site capture still succeeded");
 assert.equal(r.counts.products, 0);
 assert.equal(r.steps.find((s) => s.name === "products")!.status, "failed");
 assert.match(r.warnings.join(" "), /couldn’t import your products: database unreachable/);
 assert.match(r.report, /1 warning/);
});

test("a failed CRAWL is fatal and records the reason", async () => {
 const { deps: d, saves } = deps({ crawl: async () => { throw new Error("That’s a VYA address"); } });
 const r = await runImport(job(), d);
 assert.equal(r.status, "failed");
 assert.match(r.error || "", /VYA address/);
 assert.match(r.warnings.join(" "), /couldn’t copy your site/);
 assert.equal(saves.at(-1)?.status, "failed", "the failure is persisted, not just returned");
});

test("running out of time pauses the job and keeps its place", async () => {
 const partial: CrawlState = { queue: ["/c", "/d"], done: ["/", "/b"], paths: ["/", "/b"] };
 const { deps: d } = deps({ crawl: async () => crawlResult({ pages: 2, complete: false, state: partial }) });
 const r = await runImport(job(), d);
 assert.equal(r.status, "paused");
 assert.deepEqual(r.crawl, partial, "the queue survives so a resume continues");
 assert.equal(r.steps.find((s) => s.name === "crawl")!.status, "partial");
 assert.ok(isResumable({ status: r.status, crawl: r.crawl }));
});

test("a resume hands the saved queue back to the crawler instead of starting over", async () => {
 const saved: CrawlState = { queue: ["/c"], done: ["/", "/b"], paths: ["/", "/b"] };
 let sawResume: CrawlState | null = null;
 const { deps: d } = deps({
  crawl: async (a) => { sawResume = a.resume; return crawlResult({ pages: 3, state: { queue: [], done: ["/", "/b", "/c"], paths: ["/", "/b", "/c"] } }); },
 });
 const r = await runImport(job({ crawl: saved }), d);
 assert.deepEqual(sawResume, saved, "the crawler was told where to pick up");
 assert.equal(r.status, "done");
 assert.equal(r.counts.pages, 3);
});

test("resuming AFTER the crawl finished does not re-enter the crawler", async () => {
 // The crawler starts by DELETING the store's captured pages, so re-running it on a job whose
 // crawl already completed would destroy a good capture. This is the guard for a job killed
 // during the product import rather than during the crawl.
 let crawlCalls = 0;
 const finished: CrawlState = { queue: [], done: ["/", "/a"], paths: ["/", "/a"] };
 const doneCrawl = withStep(initialSteps(), "crawl", { status: "done", detail: "2 pages" });
 const { deps: d } = deps({ crawl: async () => { crawlCalls++; return crawlResult(); } });
 const r = await runImport(job({ crawl: finished, steps: doneCrawl }), d);
 assert.equal(crawlCalls, 0, "the crawler must not run again");
 assert.equal(r.status, "done");
 assert.equal(r.counts.pages, 2, "the earlier crawl's pages are carried forward");
 assert.equal(r.counts.products, 2, "the remaining steps still ran");
});

test("a job whose crawl finished is still resumable — work remains after the crawl", () => {
 assert.equal(isResumable({ status: "paused", crawl: { queue: [], done: ["/"], paths: ["/"] } }), true);
 assert.equal(isResumable({ status: "paused", crawl: null }), false, "nothing captured yet — a retry is a fresh import");
});

test("crawl progress is persisted DURING the crawl, so a kill mid-page loses almost nothing", async () => {
 const { deps: d, saves } = deps({
  crawl: async (a) => {
   await a.onProgress({ queue: ["/b"], done: ["/"], paths: ["/"] });
   await a.onProgress({ queue: [], done: ["/", "/b"], paths: ["/", "/b"] });
   return crawlResult({ pages: 2, state: { queue: [], done: ["/", "/b"], paths: ["/", "/b"] } });
  },
 });
 await runImport(job(), d);
 const mid = saves.filter((s) => s.crawl && s.crawl.paths.length === 1);
 assert.ok(mid.length > 0, "intermediate crawl state reached the database");
});

test("pages that wouldn't load surface as a warning instead of vanishing", async () => {
 const { deps: d } = deps({
  crawl: async () => crawlResult({ failed: [{ path: "/broken", error: "500" }, { path: "/x", error: "timeout" }] }),
 });
 const r = await runImport(job(), d);
 assert.match(r.warnings.join(" "), /2 pages couldn’t be copied \(\/broken, \/x\)/);
});

test("many broken pages collapse into one readable warning", async () => {
 const failed = Array.from({ length: 12 }, (_, i) => ({ path: `/p${i}`, error: "500" }));
 const { deps: d } = deps({ crawl: async () => crawlResult({ failed }) });
 const r = await runImport(job(), d);
 const w = r.warnings.filter((x) => /couldn’t be copied/.test(x));
 assert.equal(w.length, 1, "one warning, not twelve");
 assert.match(w[0], /and 9 more/);
});

test("structural check failures become seller-facing warnings", async () => {
 const { deps: d } = deps({ checkCapture: async () => ["The navigation menu on your homepage didn’t survive the copy."] });
 const r = await runImport(job(), d);
 assert.match(r.warnings.join(" "), /navigation menu/);
 assert.match(r.steps.find((s) => s.name === "checks")!.detail || "", /1 issue found/);
});

test("collections created but nothing filed into them is called out", async () => {
 const { deps: d } = deps({ syncMembership: async () => ({ collections: 0, links: 0 }) });
 const r = await runImport(job(), d);
 assert.match(r.warnings.join(" "), /None of your products could be matched to a collection/);
});

test("an uncrawlable site falls back to the brand storefront and says so", async () => {
 const { deps: d } = deps({ crawl: async () => crawlResult({ pages: 1, paths: ["/"], state: { queue: [], done: ["/"], paths: ["/"] } }) });
 const r = await runImport(job(), d);
 assert.equal(r.mode, "brand");
 assert.equal(r.status, "done");
 assert.equal(r.steps.find((s) => s.name === "products")!.status, "skipped");
});

test("a store with no readable products is told to upload a CSV", async () => {
 const { deps: d } = deps({
  pullProducts: async () => [],
  importItems: async () => ({ added: 0, updated: 0, unchanged: 0, skipped: 0, removed: 0 }),
 });
 const r = await runImport(job(), d);
 assert.match(r.warnings.join(" "), /upload a CSV or connect your platform/);
});

test("steps record how long they took", async () => {
 const { deps: d } = deps();
 const r = await runImport(job(), d);
 assert.ok(r.steps.every((s) => typeof s.ms === "number"), "every step timed");
});

// ── The acceptance criterion, made executable ───────────────────────────────────────────────────

test("no silent error-swallowing left in the import path", () => {
 // "No remaining .catch(() => 0)" from the milestone's acceptance criteria, enforced rather than
 // asserted in a commit message. A catch that returns a FALSY-BUT-PLAUSIBLE value (0, [], {}, null)
 // is the pattern that made failures look like empty stores.
 const root = path.resolve(import.meta.dirname, "../../..");
 const files = [
  "app/api/store/capture/route.ts",
  "app/lib/capture-commerce.ts",
  "app/lib/import-engine/run-import.ts",
  "app/lib/import-engine/wire.ts",
  "app/api/cron/import-sweeper/route.ts",
 ];
 const bad: string[] = [];
 for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), "utf8");
  src.split("\n").forEach((line, i) => {
   // Allowed: `.catch(() => {})` on a genuinely optional side effect is still a swallow, so it is
   // NOT allowed here either. Only an explicit `/* allow-swallow: reason */` marker exempts a line.
   if (/\.catch\(\s*\(\s*\)\s*=>/.test(line) && !/allow-swallow/.test(line)) bad.push(`${f}:${i + 1}  ${line.trim()}`);
  });
 }
 assert.deepEqual(bad, [], `silent catch handlers left in the import path:\n${bad.join("\n")}`);
});
