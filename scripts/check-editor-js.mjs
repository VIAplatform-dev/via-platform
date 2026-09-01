// Parse-check the editor script that gets injected into a captured page.
//
// EDITOR_JS is a ~240KB template literal inside a .ts file. `tsc` will not look inside a string, so
// a syntax error in it typechecks clean and then takes the whole imported-site editor down in the
// browser. That has already happened once.
//
// A naive extractor with a non-greedy regex stops at the first backtick-semicolon INSIDE the script
// and reports a syntax error on a perfectly good file — which is worse than no check, because it
// cries wolf. This walks to the real closing backtick and undoes the template-literal escaping, so
// what gets parsed is what the browser will actually run.
//
//   node scripts/check-editor-js.mjs

import { readFileSync } from "node:fs";

const SRC = "app/lib/site-capture.ts";
const src = readFileSync(SRC, "utf8");

const open = src.indexOf("const EDITOR_JS = `");
if (open < 0) { console.error(`FAIL: no EDITOR_JS in ${SRC}`); process.exit(1); }

let i = open + "const EDITOR_JS = `".length;
let out = "";
for (;;) {
 if (i >= src.length) { console.error("FAIL: unterminated template literal"); process.exit(1); }
 const c = src[i];
 if (c === "\\") {
  // Template-literal escapes: what the source writes as \\d, the runtime string holds as \d.
  const n = src[i + 1];
  out += n === "`" ? "`" : n === "\\" ? "\\" : n === "$" ? "$" : "\\" + n;
  i += 2;
  continue;
 }
 if (c === "`") break;
 if (c === "$" && src[i + 1] === "{") { console.error("FAIL: unexpected ${} interpolation"); process.exit(1); }
 out += c;
 i += 1;
}

try {
 new Function(out);
} catch (err) {
 console.error(`FAIL: injected editor script does not parse\n  ${err.message}`);
 process.exit(1);
}
console.log(`OK: injected editor script parses (${out.length} chars)`);
