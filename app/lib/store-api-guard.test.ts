import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// THE PROXY NO LONGER GUARDS /api/store — each route does.
//
// proxy.ts allowlists "/api/store" as one entry, because listing forty of them one by one meant
// forty-two siblings were silently left off: reaching Rentals, Sales tax or your own People page
// depended on whether someone remembered a line in a middleware file, and an endpoint left off
// answered a fetch() with a redirect to an HTML login page rather than a clean error.
//
// That trade only holds while every route authorises itself. This is the test that keeps it true.

const ROOT = path.join(process.cwd(), "app", "api", "store");

function routeFiles(dir: string): string[] {
 const out: string[] = [];
 for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) out.push(...routeFiles(p));
  else if (e.name === "route.ts") out.push(p);
 }
 return out;
}

/** The store helpers, which 401 on their own when there is no store session. */
const STORE_AUTH = /resolveStoreSlug(Any)?\s*\(|actingSeller\s*\(|isAdminRequest\s*\(|_shared"/;
/** Or a plain signed-in check: the session AND a refusal, because `auth()` alone proves nothing. */
const SESSION_AUTH = (s: string) => /await\s+auth\s*\(\s*\)/.test(s) && /401|Unauthorized/.test(s);
/** Delegating the entire request to a shared handler that authenticates (cross-listing does this). */
const DELEGATES = /return\s+\w+\(\s*request\s*,/;
/** An OAuth provider redirects back with no session to speak of; these verify their own state. */
const CALLBACK = /callback/;

test("every /api/store route authorises itself — the proxy stopped doing it for them", () => {
 const files = routeFiles(ROOT);
 assert.ok(files.length > 100, `expected the full store API, found ${files.length}`);

 const unguarded = files.filter((f) => {
  const s = fs.readFileSync(f, "utf8");
  if (STORE_AUTH.test(s) || SESSION_AUTH(s) || DELEGATES.test(s)) return false;
  if (CALLBACK.test(f)) return false;   // provider redirect: state-verified, no session exists yet
  return true;
 });

 assert.deepEqual(
  unguarded.map((f) => f.replace(ROOT + path.sep, "")),
  [],
  "these routes are reachable without authenticating — either authenticate, or take /api/store back out of PUBLIC_ROUTES",
 );
});

test("the allowlist covers the store API as one entry, not a list that rots", () => {
 const proxy = fs.readFileSync(path.join(process.cwd(), "proxy.ts"), "utf8");
 const block = /const PUBLIC_ROUTES = \[([\s\S]*?)\n\];/.exec(proxy);
 assert.ok(block, "PUBLIC_ROUTES is where it was");
 const entries = [...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
 assert.ok(entries.includes("/api/store"), "/api/store is allowlisted as a whole");
});
