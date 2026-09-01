/**
 * Trigger (or resume) a store import against a LOCAL dev server, as the owner.
 *
 *   # show what it would do, change nothing:
 *   node --env-file=.env.local --experimental-strip-types scripts/import-store.mts loved-again
 *
 *   # actually run it:
 *   node --env-file=.env.local --experimental-strip-types scripts/import-store.mts loved-again --go
 *
 *   # resume one that ran out of time:
 *   node --env-file=.env.local --experimental-strip-types scripts/import-store.mts loved-again --go --resume
 *
 * Options: --url <site>   the source site (defaults to the origin already stored for this store)
 *          --base <url>   the server to drive (default http://localhost:3333)
 *
 * WHY THIS EXISTS: /api/store/capture authenticates the owner with `Authorization: Bearer
 * $ADMIN_PASSWORD` and picks the store with `?store=<slug>`. ADMIN_PASSWORD lives in .env.local,
 * which a shell does NOT load — so the obvious curl sends `Bearer ` with nothing after it and gets a
 * silent 401 that looks exactly like a long-running crawl. Passing --env-file to node makes the
 * value available here without it ever being printed or pasted.
 *
 * A fresh (non-resume) import RESETS this store's captured pages and re-crawls from scratch, so a
 * failed crawl can leave fewer pages than you started with. Hence the dry run by default.
 */
import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--")) || "";
const flag = (name: string): string | null => {
 const i = args.indexOf(`--${name}`);
 return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const GO = args.includes("--go");
const RESUME = args.includes("--resume");
const BASE = (flag("base") || "http://localhost:3333").replace(/\/+$/, "");

if (!slug) {
 console.error("Usage: import-store.mts <store-slug> [--go] [--resume] [--url <site>] [--base <url>]");
 process.exit(1);
}
const pw = (process.env.ADMIN_PASSWORD || "").trim();
if (!pw) {
 console.error("ADMIN_PASSWORD is not set. Run with: node --env-file=.env.local …");
 process.exit(1);
}

async function storedOrigin(): Promise<string | null> {
 const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!url) return null;
 const rows = (await neon(url)`
  SELECT source_url FROM site_captures WHERE store_slug = ${slug} AND source_url IS NOT NULL LIMIT 1
 `) as { source_url: string }[];
 return rows[0]?.source_url || null;
}

async function main() {
 const auth = { Authorization: `Bearer ${pw}`, "Content-Type": "application/json" };

 // Status first: proves the password works before anything destructive, and shows what's there now.
 const statusRes = await fetch(`${BASE}/api/store/capture?store=${encodeURIComponent(slug)}`, { headers: auth });
 if (statusRes.status === 401) {
  console.error(`\n401 Unauthorized — ADMIN_PASSWORD did not match the server's.\nIs ${BASE} running with the same .env.local?\n`);
  process.exit(1);
 }
 if (!statusRes.ok) {
  console.error(`\n${BASE} answered ${statusRes.status}. Is the dev server running?\n`);
  process.exit(1);
 }
 const status = await statusRes.json() as { captured: number; origin: string | null; job: { status: string; report?: string } | null };
 const source = flag("url") || status.origin || (await storedOrigin());

 console.log(`\n${slug} @ ${BASE}`);
 console.log(`  captured now: ${status.captured} page(s)`);
 console.log(`  source site:  ${source || "UNKNOWN — pass --url <site>"}`);
 console.log(`  last job:     ${status.job ? `${status.job.status}${status.job.report ? ` — ${status.job.report}` : ""}` : "none"}`);

 if (!RESUME && !source) {
  console.error(`\nNo source URL stored for ${slug}. Re-run with --url https://their-site.com\n`);
  process.exit(1);
 }

 if (!GO) {
  console.log(`\nDRY RUN. Would POST ${RESUME ? "a RESUME of the existing job" : `a FRESH import of ${source}`}.`);
  if (!RESUME) console.log(`A fresh import RESETS the ${status.captured} captured page(s) and re-crawls from scratch.`);
  console.log(`Re-run with --go to do it.\n`);
  return;
 }

 console.log(`\nRunning… a full crawl takes a few minutes; progress appears in the dev server's own log.\n`);
 const body = RESUME ? { resume: true } : { url: source, replaceBlocks: true };
 const started = Date.now();
 const res = await fetch(`${BASE}/api/store/capture?store=${encodeURIComponent(slug)}`, { method: "POST", headers: auth, body: JSON.stringify(body) });
 const out = await res.json().catch(() => ({})) as Record<string, unknown>;
 console.log(`[HTTP ${res.status}] after ${Math.round((Date.now() - started) / 1000)}s`);
 console.log(JSON.stringify(out, null, 1));

 // "paused" is a normal outcome, not a failure: the crawl ran out of time with pages still queued.
 if (out.status === "paused") console.log(`\nPaused with pages still queued — re-run with --go --resume to continue.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
