import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// A STORE'S ADDRESS IS ITS OWN. This test reads the source and fails if anyone builds a store URL
// on a VYA host.
//
// It exists because the same mistake was made independently in five places. The assistant's
// replies, the seller's share links, the editor's "View live" button, the storefront's SEO canonical
// tag, and the proxy's missing redirect for /site, and each one looked reasonable on its own. They
// were all the same shape: a fallback, for the case where the store origin could not be resolved,
// that quietly named a path on the marketplace instead.
//
// The damage is not theoretical. A canonical tag pointing at vyaplatform.com tells Google a seller's
// shop belongs to us. A share link pointing there sends the audience she built to the marketplace.
// And serving her shop from VYA's own origin gives up the isolation Plan B exists to provide.
//
// THE RULE: call storeAddress() (or storePublicOrigin()) and handle null by hiding the link. There
// is no acceptable VYA-hosted fallback, which is why this test admits no exceptions.

const ROOT = join(import.meta.dirname, "..", "..", "..");
const SEARCH = ["app", "proxy.ts", "middleware.ts"];

/** Building a storefront URL on a host that is VYA's rather than the seller's. */
const FORBIDDEN = /(vyaplatform\.com|getvya\.ai)[^"'`\s]*\/(s|site)\//;

/** Comment lines. This file's own subject matter is these strings, and so is a lot of prose. */
const isComment = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);

function* sources(dir: string): Generator<string> {
 let entries: string[];
 try { entries = readdirSync(dir); } catch { return; }
 for (const name of entries) {
  if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
  const full = join(dir, name);
  const st = statSync(full);
  if (st.isDirectory()) { yield* sources(full); continue; }
  if (!/\.tsx?$/.test(name) || name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
  yield full;
 }
}

test("no source builds a store address on a VYA host", () => {
 const offenders: string[] = [];
 for (const entry of SEARCH) {
  const target = join(ROOT, entry);
  let files: string[];
  try { files = statSync(target).isDirectory() ? [...sources(target)] : [target]; } catch { continue; }
  for (const file of files) {
   const lines = readFileSync(file, "utf8").split("\n");
   lines.forEach((line, i) => {
    if (isComment(line)) return;
    if (FORBIDDEN.test(line)) offenders.push(`${file.slice(ROOT.length + 1)}:${i + 1}  ${line.trim().slice(0, 110)}`);
   });
  }
 }
 assert.deepEqual(
  offenders,
  [],
  `A store's address must come from storeAddress()/storePublicOrigin(), and null means hide the link. \n` +
  `never a path on vyaplatform.com or getvya.ai. Offending lines:\n  ${offenders.join("\n  ")}\n`,
 );
});

test("the guard would actually catch the mistakes it was written for", () => {
 // The five real ones, as they were written. A test that cannot fail protects nothing.
 const real = [
  "  return storePublicOrigin(slug) ?? `https://vyaplatform.com/s/${handle || slug}`;",
  "  return storePublicOrigin(slug) ?? `https://vyaplatform.com/site/${slug}`;",
  "    ? `https://vyaplatform.com/s/${handle}`",
  "  const canonicalUrl = isVyaHost ? `https://vyaplatform.com/site/${slug}${cleanPath}` : `https://${host}${cleanPath}`;",
  '  const url = "https://www.getvya.ai/s/" + handle + "?preview=1";',
 ];
 for (const line of real) assert.ok(FORBIDDEN.test(line), `should be caught: ${line.trim()}`);

 // And does not fire on things that are fine.
 const fine = [
  "  return storeAddress(slug, sf?.customDomain);",
  '  const isVyaHost = host === "vyaplatform.com" || host === "getvya.ai";',
  '  if (pathname.startsWith("/s/")) return NextResponse.next();',
  "  const origin = storePublicOrigin(slug);",
  '  redirect(`/site/${sf.storeSlug}`);',
 ];
 for (const line of fine) assert.ok(!FORBIDDEN.test(line), `should NOT be caught: ${line.trim()}`);
});
