import { test } from "node:test";
import assert from "node:assert/strict";
import { stripThemeBackgroundOverrides as strip } from "./theme-css.ts";

// The "why is my hero still white when my theme is tan" bug: custom CSS pinned a section background,
// overriding the palette. The strip must neutralize that so the theme always wins — automatically.

test("removes a hardcoded section background so the theme shows through", () => {
 const out = strip(".vya-hero{background:#ffffff;padding:40px}");
 assert.doesNotMatch(out, /background/i);
 assert.match(out, /padding:40px/); // other styling is kept
});

test("removes background from .vya-b-<id> and body/html too", () => {
 assert.doesNotMatch(strip(".vya-b-abc123{background-color:#fff}"), /background/i);
 assert.doesNotMatch(strip("body{background:#fff}"), /background/i);
});

test("strips !important background overrides as well", () => {
 assert.doesNotMatch(strip(".vya-featured{background:#fff !important}"), /background/i);
});

test("keeps non-container backgrounds (buttons, cards, content)", () => {
 assert.match(strip(".vya-cta{background:#111}"), /background:#111/);
 assert.match(strip(".my-badge{background:red}"), /background:red/);
 assert.match(strip(".vya-hero-inner{background:rgba(0,0,0,.3)}"), /background/);
});

test("leaves unrelated declarations and rules intact", () => {
 const css = ".vya-hero{background:#fff;color:red}.vya-heading{font-size:40px}";
 const out = strip(css);
 assert.match(out, /color:red/);
 assert.match(out, /font-size:40px/);
});

test("handles empty / no-background input", () => {
 assert.equal(strip(""), "");
 assert.equal(strip(".vya-heading{font-weight:700}"), ".vya-heading{font-weight:700}");
});
