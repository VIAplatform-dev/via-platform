import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// NO EM DASHES. Anywhere.
//
// An em dash is the single loudest tell that a machine wrote a sentence, and this product is sold to
// people who care how writing sounds. Roughly ten thousand of them came out of this repo in one
// pass; this test is what stops them coming back one pull request at a time.
//
// IT COVERS COMMENTS TOO, and that is deliberate rather than zealous. A rule that applied only to
// strings would need to know which strings reach a reader, and it would be wrong about template
// copy, email bodies and AI prompts on its first day. A whole-file ban has one answer, needs no
// judgement, and costs a comma.
//
// WHAT TO WRITE INSTEAD, in the order these actually come up:
//   a label before its explanation      "Spotlight: one piece"
//   an aside inside a sentence          paired commas, or brackets
//   two clauses stuck together          a full stop, and start the next one
//   a missing value in a table          "-"
//
// The en dash (–) is NOT banned. It has a real job here (Wed–Sun, 11am–6pm, 1–2 days) and doing
// that job correctly is the opposite of the problem this test exists for.

const EM = "—";

// Regexes that MATCH an em dash in text VYA did not write: scraped page titles, size strings,
// imported store names. Real titles contain em dashes whatever this repo's own copy does, so these
// character classes have to keep matching one. Each is a character class, never prose.
const PARSES_OTHER_PEOPLES_TEXT = new Set([
 "app/components/ProductCard.tsx",
 "app/lib/generate-store-preview.ts",
 "app/lib/size-parse.ts",
 "app/lib/sizeUtils.ts",
 "app/lib/eval-intake.ts",
 "app/lib/store-import.ts",
 "app/lib/site-capture.ts",
 "app/lib/storefront-from-brand.ts",
 "app/lib/plan-b/search-page.ts",
 "app/infrastructure/infraScripts.ts",
]);

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".vercel", "coverage", "dist"]);
const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".md", ".html"];

/** Every source file under a root, minus build output. */
function walk(dir: string, out: string[] = []): string[] {
 for (const name of readdirSync(dir)) {
  if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
  const p = join(dir, name);
  if (statSync(p).isDirectory()) walk(p, out);
  else if (EXTS.some((e) => name.endsWith(e))) out.push(p);
 }
 return out;
}

/**
 * An em dash inside a regex character class, e.g. /[\s·|,–—-]/ — the only allowed use.
 *
 * Quotes or a literal space inside the brackets mean it is an array literal holding prose
 * (["Nope — everything's one of one."]), which is exactly what this test is here to catch.
 */
const REGEX_CLASS = new RegExp(`\\[[^\\]\\n"' ]{0,40}${EM}[^\\]\\n"' ]{0,40}\\]`, "g");

function proseEmDashes(source: string): { line: number; text: string }[] {
 const out: { line: number; text: string }[] = [];
 source.split("\n").forEach((line, i) => {
  if (!line.includes(EM)) return;
  if (!line.replace(REGEX_CLASS, "").includes(EM)) return;
  out.push({ line: i + 1, text: line.trim().slice(0, 100) });
 });
 return out;
}

test("no em dash survives anywhere in the source", () => {
 const offenders: string[] = [];
 // .design holds the storefront copy specimens the real templates are written from, so a dash
 // left there walks back into shipped copy the next time somebody builds a template off one.
 for (const root of ["app", "mobile", "scripts", "lib", "components", ".design"]) {
  let files: string[];
  try { files = walk(root); } catch { continue; }
  for (const file of files) {
   if (file.includes("no-em-dashes.test.ts")) continue; // it has to name the character to ban it
   const hits = proseEmDashes(readFileSync(file, "utf8"));
   if (!hits.length) continue;
   if (PARSES_OTHER_PEOPLES_TEXT.has(file)) continue;
   for (const h of hits) offenders.push(`${file}:${h.line}  ${h.text}`);
  }
 }
 assert.deepEqual(
  offenders,
  [],
  `Em dashes found. Use a colon before an explanation, commas around an aside, a full stop between ` +
  `two clauses, or "-" for an empty cell:\n\n${offenders.join("\n")}\n`,
 );
});

test("an allowed file is allowed for its character class and nothing else", () => {
 // The allow-list is per FILE, which would let prose slip into one of those ten. It cannot: every
 // em dash in them still has to sit inside a character class, and this asserts that it does.
 for (const file of PARSES_OTHER_PEOPLES_TEXT) {
  let src: string;
  try { src = readFileSync(file, "utf8"); } catch { continue; } // renamed or gone: not this test's business
  assert.deepEqual(
   proseEmDashes(src).map((h) => `${file}:${h.line}  ${h.text}`),
   [],
   `${file} is allowed em dashes inside a regex character class only.`,
  );
 }
});

test("the detector knows prose from a character class", () => {
 // The ten real ones, and they must all pass.
 for (const ok of [
  String.raw`const parts = title.split(/\s+[–|${EM}·|]\s+/);`,
  String.raw`if (/^[\s·•|,–${EM}-]*VYA[\s·•|,–${EM}-]*$/.test(t)) t = "";`,
  String.raw`s.match(/^["'“]?([A-Z][^${EM}–:|]{1,38}?)["'”]?\s*[${EM}–:|]\s/)`,
 ]) assert.deepEqual(proseEmDashes(ok), [], ok);

 // And the shapes that got ten thousand of these through in the first place.
 for (const bad of [
  `const label = "Spotlight ${EM} one piece";`,
  `// A switch and not a default ${EM} the seller decides.`,
  `<p>Live ${EM} this is what shoppers reach.</p>`,
  `["Will you get more?", "Nope ${EM} everything's one of one."]`, // an array, not a class
  `const sep = " ${EM} ";`, // a space inside the brackets rule would have missed this one
 ]) assert.equal(proseEmDashes(bad).length, 1, bad);
});
