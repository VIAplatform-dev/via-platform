/**
 * Verify every dependency an eval run needs BEFORE spending money on one.
 *
 * Two runs have now been wasted producing numbers that looked meaningful and weren't: one because
 * SERPAPI_ENABLED was off, one because ANTHROPIC_API_KEY held the literal string "[SENSITIVE]" that
 * `vercel env pull` writes in place of a redacted value. Both failed SILENTLY — the pricer falls back
 * to a raw comp median and still records src='comps', so the database looks healthy afterwards.
 *
 * So this does not check that variables are SET. It checks that they are not placeholders and that
 * they actually AUTHENTICATE, with a real request to each service.
 *
 * Exit code 0 = safe to run. Non-zero = do not spend.
 */
const PLACEHOLDERS = [/^\[SENSITIVE\]$/i, /^<.*>$/, /^your[-_]/i, /^changeme$/i, /^xxx+$/i, /^todo$/i];

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

function present(key: string): string | null {
 const v = (process.env[key] || "").trim();
 if (!v) { add(key, false, "missing"); return null; }
 if (PLACEHOLDERS.some((re) => re.test(v))) { add(key, false, `placeholder (${JSON.stringify(v)}) — value was redacted by \`vercel env pull\``); return null; }
 return v;
}

async function main() {
 // ── ANTHROPIC — the one that silently invalidated the last run ──
 const anth = present("ANTHROPIC_API_KEY");
 if (anth) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
   method: "POST",
   headers: { "x-api-key": anth, "anthropic-version": "2023-06-01", "content-type": "application/json" },
   body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
  }).catch((e) => ({ ok: false, status: 0, statusText: String(e) }) as Response);
  add("ANTHROPIC_API_KEY", r.ok, r.ok ? "authenticates" : `HTTP ${r.status} — the model will NOT run; every price would be a raw comp median`);
 }

 // ── SERPAPI — key AND the enable flag, because either one alone is useless ──
 const serp = present("SERPAPI_API_KEY");
 const serpOn = (process.env.SERPAPI_ENABLED || "").trim() === "true";
 add("SERPAPI_ENABLED", serpOn, serpOn ? 'is "true"' : `is ${JSON.stringify(process.env.SERPAPI_ENABLED ?? "")} — comps will not be fetched; prices fall back to brand averages`);
 if (serp) {
  const r = await fetch(`https://serpapi.com/account?api_key=${encodeURIComponent(serp)}`).catch(() => null);
  const j = r && r.ok ? ((await r.json().catch(() => null)) as { total_searches_left?: number } | null) : null;
  const left = j?.total_searches_left;
  add("SERPAPI_API_KEY", !!r?.ok, r?.ok ? `authenticates — ${left ?? "?"} searches left this month` : `HTTP ${r?.status ?? "no response"}`);
  if (typeof left === "number" && left < 200) add("SERPAPI quota", false, `only ${left} searches left — a 40-item run needs ~120`);
 }

 // ── VOYAGE — same-piece detection. A dead key here does not error: partitionByVisualMatch
 // reports ran=false, every look-alike survives, and the pricer values the item off whatever
 // Lens happened to return. This key was revoked for a full day before anyone noticed. ──
 const voyage = present("VOYAGE_API_KEY");
 if (voyage) {
  const r = await fetch("https://api.voyageai.com/v1/multimodalembeddings", {
   method: "POST",
   headers: { Authorization: `Bearer ${voyage}`, "content-type": "application/json" },
   body: JSON.stringify({ model: "voyage-multimodal-3", inputs: [{ content: [{ type: "text", text: "preflight" }] }] }),
  }).catch((e) => ({ ok: false, status: 0, statusText: String(e) }) as Response);
  add("VOYAGE_API_KEY", r.ok, r.ok ? "authenticates" : `HTTP ${r.status} — same-piece detection is DEAD; look-alikes will price the item`);
 }

 // ── LINK VERIFY — the flag that decides whether we ever open a listing to read its price, and
 // whether a blocked host gets its price recovered via search. Unset = both steps silently skipped. ──
 const lv = (process.env.VYA_LINK_VERIFY_ENABLED || "").trim() === "true";
 add("VYA_LINK_VERIFY_ENABLED", lv, lv ? 'is "true"' : `is ${JSON.stringify(process.env.VYA_LINK_VERIFY_ENABLED ?? "")} — listing pages will not be opened and blocked prices will not be recovered`);

 // ── DATABASE ──
 const dbUrl = present("DATABASE_URL");
 if (dbUrl) {
  try {
   const { neon } = await import("@neondatabase/serverless");
   const sql = neon(dbUrl);
   const rows = (await sql`SELECT COUNT(*)::int n FROM price_eval_items`) as Array<{ n: number }>;
   add("DATABASE_URL", true, `connects — ${rows[0]?.n ?? 0} eval rows`);
  } catch (e) {
   add("DATABASE_URL", false, String(e).slice(0, 90));
  }
 }

 // ── Report ──
 const pad = Math.max(...checks.map((c) => c.name.length));
 console.log("");
 for (const c of checks) console.log(` ${c.ok ? "✓" : "✗"} ${c.name.padEnd(pad)}  ${c.detail}`);
 const bad = checks.filter((c) => !c.ok);
 console.log("");
 if (bad.length) {
  console.log(`BLOCKED — ${bad.length} problem(s). Fix these before running an eval; a run now would`);
  console.log(`produce numbers that look real and measure a broken pipeline.`);
  process.exit(1);
 }
 console.log("ALL GREEN — safe to run the eval.");
}

main().catch((e) => { console.error(e); process.exit(1); });
