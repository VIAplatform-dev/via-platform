/**
 * Grade one store from the reports the fleet already wrote, and record the verdict.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/grade-store.mts <slug> [--label fleet] [--publish]
 *
 * Reads .verify/<slug>/parity.json and blackout-<label>.json, tiers every finding (see
 * app/lib/store-health.ts), prints them, and writes .verify/<slug>/health.json. With --publish it
 * also uploads the parity side-by-side screenshots to Blob and upserts store_health, which is what
 * the seller's "Your hosted store" page reads. Exit code: 0 pass/warn, 1 fail, 2 unknown.
 */
import fs from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";
import { gradeStore } from "../app/lib/store-health.ts";
import { upsertStoreHealth, type HealthScreen } from "../app/lib/store-health-db.ts";

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"));
const label = args[args.indexOf("--label") + 1] && args.includes("--label") ? args[args.indexOf("--label") + 1] : "fleet";
const publish = args.includes("--publish");
if (!slug) { console.error("usage: grade-store.mts <slug> [--label fleet] [--publish]"); process.exit(2); }

const dir = path.join(".verify", slug);
const rd = (f: string) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; } };
const parity = rd("parity.json"), blackout = rd(`blackout-${label}.json`);
const { verdict, findings } = gradeStore({ parity, blackout });

const ICON = { blocking: "✖", degrading: "▲", cosmetic: "·" } as const;
console.log(`${slug}: ${verdict.toUpperCase()}${findings.length ? "" : " — nothing wrong"}`);
for (const f of findings) console.log(`  ${ICON[f.tier]} ${f.page ? f.page + "  " : ""}${f.message}`);

// The side-by-side pairs parity wrote: parity-ours_<page>.png ↔ parity-source_<page>.png
const screens: HealthScreen[] = [];
for (const file of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
 const m = /^parity-ours(.*)\.png$/.exec(file);
 if (!m || !fs.existsSync(path.join(dir, `parity-source${m[1]}.png`))) continue;
 // parity names the file after the path with every non-word run collapsed to "_" ("/" → "_").
 const page = Object.keys(parity?.shopper ?? {}).find((p) => p.replace(/\W+/g, "_") === m[1]) ?? "/";
 if (!publish || !process.env.BLOB_READ_WRITE_TOKEN) { screens.push({ page, ours: path.join(dir, file), source: path.join(dir, `parity-source${m[1]}.png`) }); continue; }
 const up = async (name: string) => (await put(`health/${slug}/${name}`, fs.readFileSync(path.join(dir, name)), { access: "public", addRandomSuffix: false, contentType: "image/png", allowOverwrite: true })).url;
 screens.push({ page, ours: await up(file), source: await up(`parity-source${m[1]}.png`) });
}

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "health.json"), JSON.stringify({ slug, verdict, findings, screens, checkedAt: new Date().toISOString() }, null, 1));
if (publish && !process.env.BLOB_READ_WRITE_TOKEN) console.log("  (no BLOB_READ_WRITE_TOKEN — verdict recorded without screenshots)");
if (publish) { await upsertStoreHealth({ slug, verdict, findings, screens: process.env.BLOB_READ_WRITE_TOKEN ? screens : [] }); console.log(`  recorded → store_health (${screens.length} screenshot pairs)`); }
process.exit(verdict === "fail" ? 1 : verdict === "unknown" ? 2 : 0);
