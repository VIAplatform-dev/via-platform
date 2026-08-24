/**
 * Import-engine evaluation harness.
 *
 *   npm run eval:import              # the onboarded-store corpus
 *   npm run eval:import -- --live    # re-fetch every store instead of using the cache
 *   npm run eval:import -- <url>     # score one store
 *
 * Scores the importer against real storefronts and prints a scorecard. Every claim about the
 * importer ("works on 16 of 20 stores", "detects 29 of 29 platforms") should be reproducible by
 * running this — that's the point. It reads only public pages and writes nothing to the database.
 *
 * Pages are cached under .eval-cache/ so a run is fast and comparable between code changes; pass
 * --live when you want to know whether a store has changed underneath us.
 */
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { detectPlatform, declineMessage } from "../app/lib/import-engine/detect.ts";
import { injectCollectionItems, detectGridHandles } from "../app/lib/site-capture.ts";
import { readBrand } from "../app/lib/storefront-from-brand.ts";
import { safeFetch } from "../app/lib/safe-url.ts";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const CACHE = path.join(process.cwd(), ".eval-cache");

/** The stores VYA has onboarded or evaluated, with the platform each was confirmed to be running.
 *  `expect` is the assertion — a mismatch means detection regressed or the store migrated. */
const CORPUS: { url: string; expect: string }[] = [
 { url: "https://blummier.com", expect: "shopify" },
 { url: "https://angearchive.com", expect: "shopify" },
 { url: "https://hachiarchive.com", expect: "shopify" },
 { url: "https://maisonoptimismvintage.com", expect: "shopify" },
 { url: "https://mybagcrush.com", expect: "shopify" },
 { url: "https://theobjectsofaffection.com", expect: "shopify" },
 { url: "https://vintagearchivesla.com", expect: "shopify" },
 { url: "https://www.chillboutiqueconsignment.com", expect: "shopify" },
 { url: "https://www.awokevintage.com", expect: "shopify" },
 { url: "https://www.unique-vintage.com", expect: "shopify" },
 { url: "https://wethieves.com", expect: "shopify" },
 { url: "https://shopvintagecharm.com", expect: "shopify" },
 { url: "https://feathersboutiquevintage.com", expect: "shopify" },
 { url: "https://leivintage.com", expect: "squarespace" },
 { url: "https://montroseedit.com", expect: "squarespace" },
 { url: "https://thevintageboutiquestyle.com", expect: "unknown" },
];

const key = (url: string) => url.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "_") + ".html";

async function load(url: string, live: boolean): Promise<string | null> {
 fs.mkdirSync(CACHE, { recursive: true });
 const file = path.join(CACHE, key(url));
 if (!live && fs.existsSync(file)) return fs.readFileSync(file, "utf8");
 try {
  const r = await safeFetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) return null;
  const html = await r.text();
  fs.writeFileSync(file, html);
  return html;
 } catch {
  return null;
 }
}

/** Three fake items are enough to prove the live grid renders in the store's own card. */
const SAMPLE = [
 { id: "e1", title: "1990s Silk Slip Dress", priceCents: 18000, currency: "USD", images: ["https://x/1.jpg"], sourceId: "silk-slip" },
 { id: "e2", title: "Beaded Evening Clutch", priceCents: 9500, currency: "USD", images: ["https://x/2.jpg"], sourceId: "clutch" },
 { id: "e3", title: "Wool Overcoat", priceCents: 42000, currency: "USD", images: ["https://x/3.jpg"], sourceId: "coat" },
];

type Row = {
 store: string; platform: string; ok: boolean; declined: boolean;
 grid: "theme" | "fallback" | "none"; titles: number; brand: number; notes: string[];
};

function score(url: string, html: string, expect: string): Row {
 const store = url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
 const notes: string[] = [];
 const d = detectPlatform(html, url);
 const ok = d.platform === expect;
 if (!ok) notes.push(`platform ${d.platform}, expected ${expect}`);
 const declined = Boolean(declineMessage(d)) || d.shell.isShell;

 // Live-grid rendering: does the store's OWN product card get reused?
 let grid: Row["grid"] = "none";
 let titles = 0;
 const out = injectCollectionItems(html, SAMPLE as never, (it) => `/p/${(it as { id: string }).id}`);
 const $ = cheerio.load(out);
 const $live = $("[data-vya-collection]");
 if ($live.length) {
  const generic = ($live.attr("style") || "").includes("grid-template-columns");
  grid = generic ? "fallback" : "theme";
  titles = SAMPLE.filter((s) => out.includes(s.title)).length;
 }
 if (grid === "fallback") notes.push("generic grid — theme card not found");
 if (grid === "theme" && titles < SAMPLE.length) notes.push(`only ${titles}/${SAMPLE.length} titles rendered`);

 // Homepage grids must line up with the collections they belong to.
 const handles = detectGridHandles(html);
 if (handles.length && handles.every((h) => h === null)) notes.push("grids found but no collection handles resolved");

 return { store, platform: d.platform, ok, declined, grid, titles, brand: 0, notes };
}

async function main() {
 const args = process.argv.slice(2);
 const live = args.includes("--live");
 const single = args.find((a) => a.startsWith("http"));
 const targets = single ? [{ url: single, expect: "" }] : CORPUS;

 console.log(`\nIMPORT ENGINE — ${targets.length} store${targets.length === 1 ? "" : "s"}${live ? " (live fetch)" : " (cached)"}\n`);
 const rows: Row[] = [];
 for (const t of targets) {
  const html = await load(t.url, live);
  if (!html) { console.log(`  ✘ ${t.url} — unreachable`); continue; }
  const row = score(t.url, html, t.expect || detectPlatform(html, t.url).platform);
  const brand = await readBrand(t.url).catch(() => null);
  row.brand = brand?.found.length ?? 0;
  rows.push(row);
  const mark = !row.ok ? "✘" : row.grid === "theme" ? "✔" : row.declined ? "·" : "~";
  console.log(
   `  ${mark} ${row.store.slice(0, 30).padEnd(32)}${row.platform.padEnd(14)}` +
   `grid=${row.grid.padEnd(9)}titles=${row.titles}/3  brand=${row.brand}` +
   (row.notes.length ? `  ⚠ ${row.notes.join("; ")}` : ""),
  );
 }

 const n = rows.length || 1;
 const detected = rows.filter((r) => r.ok).length;
 const themed = rows.filter((r) => r.grid === "theme").length;
 const rendered = rows.filter((r) => r.titles === SAMPLE.length).length;
 const branded = rows.filter((r) => r.brand >= 3).length;
 const pct = (x: number) => `${Math.round((x / n) * 100)}%`.padStart(4);
 console.log(`
  ─────────────────────────────────────────────
  platform detected      ${String(detected).padStart(2)}/${n}  ${pct(detected)}
  theme-matched grid     ${String(themed).padStart(2)}/${n}  ${pct(themed)}
  live products rendered ${String(rendered).padStart(2)}/${n}  ${pct(rendered)}
  brand readable (3+)    ${String(branded).padStart(2)}/${n}  ${pct(branded)}
  ─────────────────────────────────────────────`);
 // Detection regressions are the only hard failure: a wrong platform sends a store down the
 // wrong extraction path entirely. A generic grid is a fidelity miss, not a broken import.
 if (detected < n) { console.log("\n  FAIL — platform detection regressed\n"); process.exit(1); }
 console.log("\n  PASS\n");
}

main();
