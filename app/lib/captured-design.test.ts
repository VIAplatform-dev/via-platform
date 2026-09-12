import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDesign, buildDesignCss, detectThemeModel } from "./captured-design.ts";

const EMPTY = { accent: null, heading: null, body: null, bg: null, text: null, radius: null };

test("empty settings produce no design block (just preserved rest)", () => {
 assert.equal(buildDesignCss(EMPTY, ".x{color:red}"), ".x{color:red}");
 assert.equal(buildDesignCss(EMPTY, ""), "");
});

test("build → parse round-trips the settings", () => {
 const settings = { accent: "#5D0F17", heading: "Playfair Display", body: "Inter", bg: null, text: null, radius: null };
 const css = buildDesignCss(settings, "");
 const parsed = parseDesign(css);
 assert.deepEqual(parsed.settings, settings);
 assert.match(css, /font-family:'Playfair Display'.*!important/);
 assert.match(css, /body:not\(#vya-d\)\{font-family:'Inter'/);
 assert.match(css, /background-color:#5D0F17!important/);
 assert.match(css, /fonts\.googleapis\.com/);
});

test("other custom CSS is preserved across a design update", () => {
 // Assistant-added CSS sits after the design block; re-building keeps it.
 const original = buildDesignCss({ ...EMPTY, accent: "#5D0F17" }, ".hero{padding:80px}");
 const { settings, rest } = parseDesign(original);
 assert.equal(rest, ".hero{padding:80px}");
 assert.equal(settings.accent, "#5D0F17");
 // Change only the heading font; the .hero rule must survive.
 const updated = buildDesignCss({ ...settings, heading: "Fraunces" }, rest);
 assert.ok(updated.includes(".hero{padding:80px}"));
 assert.equal(parseDesign(updated).settings.heading, "Fraunces");
});

// Fonts are no longer restricted to a curated list (any reasonable Google-font family is
// allowed), so validation is about SHAPE: a malformed color or a name with markup-unsafe
// characters is dropped; an ordinary family name is kept.
test("an invalid accent is dropped while an arbitrary font family is kept", () => {
 const css = buildDesignCss({ accent: "not-a-color", heading: "Comic Sans", body: "Inter", bg: null, text: null, radius: null }, "");
 assert.ok(!css.includes("not-a-color"));
 assert.equal(parseDesign(css).settings.accent, null);
 assert.equal(parseDesign(css).settings.heading, "Comic Sans");
 assert.equal(parseDesign(css).settings.body, "Inter");
});

test("a font name with unsafe characters is rejected", () => {
 const css = buildDesignCss({ accent: null, heading: "Evil'; }", body: null, bg: null, text: null, radius: null }, "");
 assert.ok(!css.includes("Evil"));
 assert.equal(parseDesign(css).settings.heading, null);
});

test("bg, text and radius round-trip through the design block", () => {
 const settings = { accent: null, heading: null, body: null, bg: "#FFF8F0", text: "#221111", radius: "round" as const };
 const parsed = parseDesign(buildDesignCss(settings, ""));
 assert.deepEqual(parsed.settings, settings);
});

test("parseDesign on a blob with no design block returns it all as rest", () => {
 const { settings, rest } = parseDesign(".a{color:blue}");
 assert.deepEqual(settings, EMPTY);
 assert.equal(rest, ".a{color:blue}");
});

// ── Theme-aware colours ────────────────────────────────────────────────────────────────────────
// A Shopify theme paints every band from its colour-scheme variables, so a `body{background}` rule is
// covered by the first section and a `body{color}` rule never reaches text the scheme colours itself.
// Measured on thenicheshop-2 (Dawn): Background and Text changed <body> and nothing a shopper can see.

const DAWN = `<style>
:root, .color-scheme-1 { --color-background: 255,255,255; --gradient-background: #ffffff; --color-foreground: 18,18,18; --color-button: 157,21,35; }
.color-scheme-2 { --color-background: 243,243,243; --color-foreground: 18,18,18; }
.color-scheme-3 { --color-background: 36,40,51; --color-foreground: 255,255,255; }
.color-scheme-f7b804ca-b2b9 { --color-background: 157,21,35; --color-foreground: 255,255,255; }
body, .color-scheme-1, .color-scheme-2 { color: rgba(var(--color-foreground), 0.75); background-color: rgb(var(--color-background)); }
</style>`;

const HORIZON = `<style>
slideshow-controls[controls-on-media]:has(.slideshow-controls__dots) { --color-foreground: #fff; --color-foreground-rgb: var(--color-white-rgb) }
:root, .color-scheme-1 { --color-background: rgb(255 255 255 / 1.0); /* RGB values only */ --color-background-rgb: 255 255 255; --color-foreground: rgb(0 0 0 / 1.0); --color-foreground-rgb: 0 0 0; }
.color-scheme-2 { --color-background: rgb(245 240 230 / 1.0); --color-background-rgb: 245 240 230; --color-foreground-rgb: 0 0 0; }
.color-scheme-5 { --color-background: rgb(20 20 20 / 1.0); --color-background-rgb: 20 20 20; --color-foreground-rgb: 255 255 255; }
.header[transparent] { --color-background: inherit; --color-background-rgb: inherit }
</style>`;

const SQUARESPACE = `<style>
:root{--white-hsl:0,0%,100%;--black-hsl:0,0%,0%}
:root{--siteBackgroundColor:hsla(var(--white-hsl),1);--paragraphMediumColor:hsla(var(--black-hsl),1)}
[data-section-theme="white"]{--siteBackgroundColor:hsla(var(--white-hsl),1)}
[data-section-theme="light"]{--siteBackgroundColor:hsla(var(--lightAccent-hsl),1)}
[data-section-theme="dark"]{--siteBackgroundColor:hsla(var(--darkAccent-hsl),1)}
[data-section-theme="black-bold"]{--siteBackgroundColor:hsla(var(--black-hsl),1)}
[data-section-theme="bright"]{--siteBackgroundColor:hsla(var(--accent-hsl),1)}
</style>`;

test("detects a Dawn-family theme and recolours the schemes that share its default polarity", () => {
 const m = detectThemeModel(DAWN);
 assert.equal(m.kind, "dawn");
 // The light default and the light grey band follow the palette; the dark band and the red utility bar
 // are deliberate contrast and keep their own colours.
 assert.deepEqual(m.schemes, [":root", ".color-scheme-1", ".color-scheme-2"]);
});

test("detects a Horizon-family theme, ignoring complex selectors that also set the variables", () => {
 const m = detectThemeModel(HORIZON);
 assert.equal(m.kind, "horizon");
 assert.deepEqual(m.schemes, [":root", ".color-scheme-1", ".color-scheme-2"]);
});

test("detects Squarespace section themes by their light/dark names", () => {
 const m = detectThemeModel(SQUARESPACE);
 assert.equal(m.kind, "squarespace");
 assert.deepEqual(m.schemes, [":root", '[data-section-theme="white"]', '[data-section-theme="light"]']);
});

test("an unrecognised theme is generic", () => {
 assert.deepEqual(detectThemeModel("<style>body{background:#fff;color:var(--text)}</style>"), { kind: "generic", schemes: [] });
 assert.deepEqual(detectThemeModel(""), { kind: "generic", schemes: [] });
});

const PALETTE = { ...EMPTY, bg: "#FFFFFF", text: "#0A0A0A", accent: "#C40025" };

test("Dawn: the palette is written into the scheme variables, in Dawn's comma-triplet format", () => {
 const css = buildDesignCss(PALETTE, "", detectThemeModel(DAWN));
 assert.match(css, /\.color-scheme-2:not\(#vya-d\)/);
 assert.ok(!css.includes(".color-scheme-3"), "a dark band keeps its own scheme");
 assert.match(css, /--color-background:255,255,255!important/);
 assert.match(css, /--gradient-background:#FFFFFF!important/);
 assert.match(css, /--color-foreground:10,10,10!important/);
 assert.match(css, /--color-button:196,0,37!important/);
 assert.match(css, /--color-button-text:255,255,255!important/);
 assert.match(css, /--color-link:196,0,37!important/);
 // No blanket `button{}` rule: it painted every icon button, carousel arrow and VYA's own cart controls.
 assert.ok(!/(^|[\n,])button[,{]/.test(css));
 assert.deepEqual(parseDesign(css).settings, PALETTE);
});

test("Horizon: full colours plus the -rgb channels, headings and both button styles", () => {
 const css = buildDesignCss(PALETTE, "", detectThemeModel(HORIZON));
 assert.match(css, /--color-background:rgb\(255 255 255\)!important/);
 assert.match(css, /--color-background-rgb:255 255 255!important/);
 assert.match(css, /--color-foreground:rgb\(10 10 10\)!important/);
 assert.match(css, /--color-foreground-rgb:10 10 10!important/);
 assert.match(css, /--color-foreground-heading:rgb\(10 10 10\)!important/);
 assert.match(css, /--color-primary-button-background:rgb\(196 0 37\)!important/);
 assert.match(css, /--color-primary-button-text:rgb\(255 255 255\)!important/);
 assert.match(css, /--color-primary:rgb\(196 0 37\)!important/);
 assert.ok(!css.includes("--color-background:255,255,255"), "never Dawn's triplet format on a Horizon theme");
});

test("Squarespace: site background, text and button variables on the light section themes", () => {
 const css = buildDesignCss(PALETTE, "", detectThemeModel(SQUARESPACE));
 assert.match(css, /\[data-section-theme="light"\]:not\(#vya-d\)/);
 assert.ok(!css.includes('"dark"'));
 assert.match(css, /--siteBackgroundColor:#FFFFFF!important/);
 assert.match(css, /--paragraphMediumColor:#0A0A0A!important/);
 assert.match(css, /--headingLargeColor:#0A0A0A!important/);
 assert.match(css, /--primaryButtonBackgroundColor:#C40025!important/);
 assert.match(css, /--primaryButtonTextColor:#FFFFFF!important/);
});

test("a light accent gets dark button text", () => {
 const css = buildDesignCss({ ...EMPTY, accent: "#F5E6A0" }, "", detectThemeModel(DAWN));
 assert.match(css, /--color-button-text:17,17,17!important/);
});

test("fonts reach the theme's own font variables as well as the heading/body elements", () => {
 const fonts = { ...EMPTY, heading: "Playfair Display", body: "Inter" };
 assert.match(buildDesignCss(fonts, "", detectThemeModel(DAWN)), /--font-heading-family:'Playfair Display', Georgia, serif!important/);
 assert.match(buildDesignCss(fonts, "", detectThemeModel(DAWN)), /--font-body-family:'Inter', system-ui, sans-serif!important/);
 const hz = buildDesignCss(fonts, "", detectThemeModel(HORIZON));
 assert.match(hz, /--font-h4--family:'Playfair Display'/);
 assert.match(hz, /--font-paragraph--family:'Inter'/);
 assert.match(buildDesignCss(fonts, "", detectThemeModel(SQUARESPACE)), /--heading-font-font-family:'Playfair Display'/);
 for (const t of [DAWN, HORIZON, SQUARESPACE, ""]) assert.match(buildDesignCss(fonts, "", detectThemeModel(t)), /h1:not\(#vya-d\),h2:not\(#vya-d\)/);
});

test("generic themes: body colours, and an accent that stays off VYA's own controls", () => {
 const css = buildDesignCss(PALETTE, "", { kind: "generic", schemes: [] });
 assert.match(css, /body:not\(#vya-d\)\{background-color:#FFFFFF!important\}/);
 assert.match(css, /body:not\(#vya-d\)\{color:#0A0A0A!important\}/);
 assert.match(css, /:not\(\[id\^="vya-"\] \*\)/);
 assert.ok(!/(^|[\n,])button[,{]/.test(css));
});

test("scheme selectors handed in from outside are validated before they reach the CSS", () => {
 const css = buildDesignCss(PALETTE, "", { kind: "dawn", schemes: [":root", ".ok-1", ".x{}body{display:none}"] });
 assert.ok(css.includes(".ok-1:not(#vya-d)"));
 assert.ok(!css.includes("display:none"));
});
