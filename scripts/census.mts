/**
 * Census: every finding across every graded store, grouped by KIND rather than by store.
 *
 *   node --experimental-strip-types scripts/census.mts
 *
 * A finding on 19 of 22 stores is not 19 sellers' problem — it is ours (engine or checker). The
 * census is how per-store fixing becomes fix-once: read the top clusters, decide engine bug /
 * checker bug / real seller fact, fix, re-run the fleet, repeat until only singletons remain.
 * Reads .verify/<slug>/health.json (written by grade-store.mts); writes .verify/CENSUS.md.
 */
import fs from "node:fs";
import path from "node:path";
import { findingKind, type Finding, type Verdict } from "../app/lib/store-health.ts";
import { EXCLUDED_STORES } from "../app/lib/fleet-roster.ts";

type Health = { slug: string; verdict: Verdict; findings: Finding[] };
const stores: Health[] = [];
for (const slug of fs.existsSync(".verify") ? fs.readdirSync(".verify") : []) {
 // Two captures are the same shop imported twice; counting a copy makes one seller's finding look
 // like two sellers' — see app/lib/fleet-roster.ts. A stale health.json from before they were
 // dropped would otherwise keep inflating every cluster.
 if (EXCLUDED_STORES.has(slug)) continue;
 try { stores.push(JSON.parse(fs.readFileSync(path.join(".verify", slug, "health.json"), "utf8"))); } catch { /* not graded */ }
}
const clusters = new Map<string, { stores: Set<string>; n: number; example: Finding }>();
for (const s of stores) for (const f of s.findings) {
 const k = findingKind(f);
 const c = clusters.get(k) ?? { stores: new Set<string>(), n: 0, example: f };
 c.stores.add(s.slug); c.n++; clusters.set(k, c);
}
const rows = [...clusters.entries()].sort((a, b) => b[1].stores.size - a[1].stores.size || b[1].n - a[1].n);
const verdicts = { pass: 0, warn: 0, fail: 0, unknown: 0 } as Record<Verdict, number>;
for (const s of stores) verdicts[s.verdict]++;

const out: string[] = [];
out.push(`# Census — ${stores.length} stores · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, "");
out.push(`pass ${verdicts.pass} · warn ${verdicts.warn} · fail ${verdicts.fail}${verdicts.unknown ? ` · unknown ${verdicts.unknown}` : ""}`, "");
out.push("| stores | findings | kind | example |", "|---|---|---|---|");
for (const [k, c] of rows) out.push(`| ${c.stores.size} | ${c.n} | ${k} | ${c.example.message.slice(0, 90)} |`);
out.push("", "## Singletons (only one store) — likely that store's own facts", "");
for (const [k, c] of rows) if (c.stores.size === 1) out.push(`- ${[...c.stores][0]}: ${k}`);
out.push("", "## By store", "");
for (const s of [...stores].sort((a, b) => a.slug.localeCompare(b.slug))) out.push(`- **${s.slug}** ${s.verdict.toUpperCase()} — ${s.findings.filter((f) => f.tier === "blocking").length} blocking, ${s.findings.filter((f) => f.tier === "degrading").length} degrading`);
fs.writeFileSync(".verify/CENSUS.md", out.join("\n") + "\n");

console.log(`${stores.length} stores · pass ${verdicts.pass} · warn ${verdicts.warn} · fail ${verdicts.fail}\n`);
for (const [k, c] of rows.filter(([, c]) => c.stores.size > 1)) console.log(`${String(c.stores.size).padStart(3)} stores  ${String(c.n).padStart(4)}×  ${k}`);
console.log(`\n${rows.filter(([, c]) => c.stores.size === 1).length} singleton kinds → .verify/CENSUS.md`);
