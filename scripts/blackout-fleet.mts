/**
 * Blackout-gate EVERY hosted store, sequentially, and print one table.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/blackout-fleet.mts [--port 3333] [slug ...]
 *
 * One Chromium at a time on purpose: three concurrent verifier runs crashed the browser (exit 144)
 * earlier, and a gate that sometimes dies mid-run is a gate nobody trusts. Slow and correct beats
 * fast and occasionally silent. Each store's per-page detail and screenshots land in .verify/<slug>/
 * via blackout-check; this file is the roll-up.
 */
import { spawnSync } from "node:child_process";
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3333";
let slugs = args.filter((a) => !a.startsWith("--") && a !== port);
if (!slugs.length) {
 const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL!);
 slugs = (await sql`SELECT DISTINCT store_slug s FROM site_captures ORDER BY store_slug` as { s: string }[]).map((r) => r.s);
}

type Row = { slug: string; pages: number; survives: number; losses: string[]; error?: string };
const rows: Row[] = [];
for (const slug of slugs) {
 const t0 = Date.now();
 const r = spawnSync("node", ["--experimental-strip-types", "--env-file=.env.local", "scripts/blackout-check.mts", slug, "--port", port, "--label", "fleet"], {
  encoding: "utf8", timeout: 15 * 60 * 1000, env: process.env,
 });
 const jsonPath = path.join(".verify", slug, "blackout-fleet.json");
 if (!fs.existsSync(jsonPath)) { rows.push({ slug, pages: 0, survives: 0, losses: [], error: (r.stderr || r.stdout || "no output").split("\n").filter(Boolean).slice(-2).join(" | ").slice(0, 120) }); console.log(`${slug.padEnd(28)} ERROR`); continue; }
 const j = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as { pages: Record<string, { normal: Record<string, number>; blackout: Record<string, number> }> };
 let survives = 0; const losses: string[] = [];
 for (const [p, { normal: n, blackout: b }] of Object.entries(j.pages)) {
  if (!n || !b || (n as { error?: string }).error || (b as { error?: string }).error) { losses.push(`${p}: could not render`); continue; }
  const l: string[] = [];
  if (b.imgsLoaded < n.imgsLoaded) l.push(`-${n.imgsLoaded - b.imgsLoaded} imgs`);
  if (n.logoLoaded && !b.logoLoaded) l.push("logo");
  if (n.headerVisible && !b.headerVisible) l.push("header");
  if (b.productLinks < n.productLinks) l.push(`-${n.productLinks - b.productLinks} products`);
  if (b.bgImagesShopify > 0) l.push(`${b.bgImagesShopify} bg on shopify`);
  if (n.videosPlaying > 0 && b.videosPlaying < n.videosPlaying) l.push("video");
  if (b.text < n.text * 0.9) l.push(`-${Math.round((1 - b.text / n.text) * 100)}% text`);
  if (l.length) losses.push(`${p}: ${l.join(", ")}`); else survives++;
 }
 const pages = Object.keys(j.pages).length;
 rows.push({ slug, pages, survives, losses });
 console.log(`${slug.padEnd(28)} ${survives}/${pages} pages survive  ${losses.length ? "· " + losses.join(" ; ").slice(0, 110) : ""}  (${Math.round((Date.now() - t0) / 1000)}s)`);
}

console.log("\n══ BLACKOUT FLEET SUMMARY ══");
const pass = rows.filter((r) => !r.error && r.survives === r.pages && r.pages > 0);
const fail = rows.filter((r) => !r.error && r.survives < r.pages);
const err = rows.filter((r) => r.error);
console.log(`survive cancellation unchanged : ${pass.length}  ${pass.map((r) => r.slug).join(", ")}`);
console.log(`lose something                 : ${fail.length}  ${fail.map((r) => r.slug).join(", ")}`);
if (err.length) console.log(`could not test                 : ${err.length}  ${err.map((r) => `${r.slug} (${r.error})`).join("; ")}`);
fs.writeFileSync(path.join(".verify", "blackout-fleet-summary.json"), JSON.stringify(rows, null, 1));
process.exit(fail.length || err.length ? 1 : 0);
