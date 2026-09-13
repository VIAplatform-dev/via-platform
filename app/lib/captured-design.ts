// Global "design" layer for imported/captured storefronts. The seller picks accent / background / text
// colours, a corner style, and heading/body fonts; we express that as a CSS block injected over their
// theme (via the site-wide custom-CSS row). The block is self-describing — a JSON comment header lets the
// editor read the current settings back — and any OTHER custom CSS (e.g. added by the VYA assistant) is
// preserved alongside it.
//
// WHERE THE COLOURS GO. A theme does not paint its bands from <body>: Shopify's themes paint every
// section from colour-scheme variables on scheme classes, and Squarespace from section-theme variables.
// So `body{background;color}` changed <body> and nothing a shopper could see — measured on a Dawn store,
// the first section covered the new background and the scheme's own text colour beat the inherited one.
// Colours are therefore written INTO the theme's variables (detectThemeModel says which dialect), on the
// default scheme and every scheme of the same light/dark polarity; a deliberately contrasting band (a dark
// footer, a red announcement bar) keeps its own colours. Unrecognised themes get the body-level fallback.
//
// WHY `:not(#vya-d)`. No element has that id, so it matches everything — and adds id-level specificity.
// The overlay then beats the theme's own declarations (important ones included) regardless of where it
// lands in the document: the editor's live preview puts it in <head>, before the theme's in-body styles.

export type Radius = "sharp" | "soft" | "round";
export type DesignSettings = { accent: string | null; heading: string | null; body: string | null; bg: string | null; text: string | null; radius: Radius | null };
/** Which variable dialect a captured theme speaks, and the scheme selectors a palette should recolour. */
export type ThemeKind = "dawn" | "horizon" | "squarespace" | "generic";
export type ThemeModel = { kind: ThemeKind; schemes: string[] };

const START = "/* vya-design:";
const END = "/* vya-design-end */";
const BOOST = ":not(#vya-d)";

const SERIFS = new Set(["Playfair Display", "Cormorant Garamond", "Bodoni Moda", "Fraunces", "Newsreader", "Instrument Serif", "EB Garamond", "Source Serif 4"]);
// Kept for any callers/UI that still want a flat list, but fonts are no longer restricted to these.
export const HEADING_FONTS = ["Playfair Display", "Cormorant Garamond", "Bodoni Moda", "Fraunces", "Newsreader", "Instrument Serif", "EB Garamond", "Inter", "Poppins", "Montserrat"];
export const BODY_FONTS = ["Inter", "Poppins", "Montserrat", "Lato", "Work Sans", "Nunito Sans", "EB Garamond", "Newsreader"];

function fam(name: string): string {
 return `'${name.replace(/['"\\]/g, "")}', ${SERIFS.has(name) ? "Georgia, serif" : "system-ui, sans-serif"}`;
}
const isHex = (v: string) => /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v);
const isFont = (v: string) => /^[\w \-]{2,40}$/.test(v); // any reasonable Google-font family name
const RADIUS_PX: Record<Radius, string> = { sharp: "0", soft: "10px", round: "22px" };

type Rgb = [number, number, number];
function rgbOf(hex: string): Rgb {
 let h = hex.slice(1);
 if (h.length <= 4) h = h.split("").map((c) => c + c).join("");
 return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const luma = ([r, g, b]: Rgb) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
/** Legible text on a filled button of this colour. */
const onColour = (c: Rgb): Rgb => (luma(c) > 0.55 ? [17, 17, 17] : [255, 255, 255]);
const toHex = (c: Rgb) => "#" + c.map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();

// ── Reading the theme ────────────────────────────────────────────────────────────────────────────

// Only plain scheme selectors are recoloured. Themes also set these variables on complex selectors
// (a transparent header, slideshow controls over a photo) — those are local effects, not bands.
const SCHEME_SEL = /^(?::root|\.[A-Za-z0-9_-]{1,80})$/;
const SQ_SECTION_SEL = /^\[data-section-theme=["']?([a-z0-9-]{1,30})["']?\]$/i;
// What may reach the generated CSS. The model travels through the editor, so it is checked again here.
const SAFE_SCOPE = /^(?::root|\.[A-Za-z0-9_-]{1,80}|\[data-section-theme="[a-z0-9-]{1,30}"\])$/;
const MAX_SCHEMES = 60;

type Rule = { selectors: string[]; body: string };
/** Every rule that DECLARES `prop`, found by scanning for the property rather than parsing all CSS —
 *  captured pages run to megabytes, and a rule-matching regex over them backtracks for seconds. */
function rulesDefining(src: string, prop: string): Rule[] {
 const out: Rule[] = [];
 const seen = new Set<number>();
 for (let i = src.indexOf(prop); i !== -1 && out.length < 400; i = src.indexOf(prop, i + prop.length)) {
  if (/[\w-]/.test(src[i - 1] ?? "") || !/^\s*:/.test(src.slice(i + prop.length, i + prop.length + 8))) continue; // a longer name, or var(--x)
  const open = src.lastIndexOf("{", i);
  const close = src.indexOf("}", i);
  if (open === -1 || close === -1 || src.lastIndexOf("}", i) > open || seen.has(open)) continue;
  seen.add(open);
  const from = Math.max(src.lastIndexOf("}", open), src.lastIndexOf("{", open - 1), src.lastIndexOf(";", open)) + 1;
  let sel = src.slice(from, open).replace(/\/\*[\s\S]*?\*\//g, "");
  if (sel.includes("<")) sel = sel.slice(sel.lastIndexOf(">") + 1); // the rule opened a <style> block
  out.push({ selectors: sel.split(",").map((s) => s.trim()).filter(Boolean), body: src.slice(open + 1, close) });
 }
 return out;
}

function declValue(body: string, prop: string): string | null {
 const m = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;]+)`).exec(body.replace(/\/\*[\s\S]*?\*\//g, ""));
 return m ? m[1].trim() : null;
}

function channels(v: string): Rgb | null {
 const hex = /#([0-9a-fA-F]{3,8})\b/.exec(v);
 if (hex && isHex("#" + hex[1])) return rgbOf("#" + hex[1]);
 const m = /(\d{1,3}(?:\.\d+)?)\s*[, ]\s*(\d{1,3}(?:\.\d+)?)\s*[, ]\s*(\d{1,3}(?:\.\d+)?)/.exec(v);
 return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * Work out how a captured page's theme sets its colours.
 *
 *  · dawn        — Dawn and the themes built on it (Taste, Spotlight, …): comma triplets, `rgb(var(--x))`.
 *  · horizon     — Horizon and its family (Savor, Vessel, Dwell, …): full colours plus `-rgb` channels.
 *  · squarespace — 7.1 section themes: `--siteBackgroundColor` and friends on [data-section-theme].
 *  · generic     — anything else; only the body-level fallback applies.
 *
 * `schemes` is `:root`, the default scheme, and every scheme of the same light/dark polarity.
 */
export function detectThemeModel(html: string): ThemeModel {
 const src = String(html || "");

 const schemeRules = rulesDefining(src, "--color-background")
  .map((r) => ({ sels: r.selectors.filter((s) => SCHEME_SEL.test(s)), body: r.body }))
  .filter((r) => r.sels.length);
 const dawn = schemeRules.some((r) => /^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(declValue(r.body, "--color-background") || ""));
 const horizon = !dawn && schemeRules.some((r) => declValue(r.body, "--color-background-rgb") !== null || declValue(r.body, "--color-foreground-rgb") !== null);
 if (dawn || horizon) {
  const rules = schemeRules.map((r) => ({ sels: r.sels, rgb: channels(declValue(r.body, "--color-background") || "") }));
  const def = rules.find((r) => r.sels.includes(":root")) ?? rules.find((r) => r.sels.includes(".color-scheme-1")) ?? rules[0];
  const light = def.rgb ? luma(def.rgb) >= 0.5 : true;
  const schemes = [":root"];
  for (const r of rules) {
   if (r !== def && (!r.rgb || luma(r.rgb) >= 0.5 !== light)) continue;
   for (const s of r.sels) if (!schemes.includes(s)) schemes.push(s);
  }
  return { kind: dawn ? "dawn" : "horizon", schemes: schemes.slice(0, MAX_SCHEMES) };
 }

 const sq = rulesDefining(src, "--siteBackgroundColor");
 if (sq.length) {
  const root = sq.find((r) => r.selectors.includes(":root"));
  const light = !/--(?:black|darkAccent)-hsl/.test(root ? declValue(root.body, "--siteBackgroundColor") || "" : "");
  const names = light ? ["white", "white-bold", "light", "light-bold"] : ["dark", "dark-bold", "black", "black-bold"]; // "bright" follows the accent, either way
  const schemes = [":root"];
  for (const r of sq) for (const s of r.selectors) {
   const name = SQ_SECTION_SEL.exec(s)?.[1].toLowerCase();
   const sel = `[data-section-theme="${name}"]`;
   if (name && names.includes(name) && !schemes.includes(sel)) schemes.push(sel);
  }
  return { kind: "squarespace", schemes };
 }

 return { kind: "generic", schemes: [] };
}

// ── Writing the design ───────────────────────────────────────────────────────────────────────────

/** Split a stored custom-CSS blob into the design settings + whatever other CSS it holds. */
export function parseDesign(css: string): { settings: DesignSettings; rest: string } {
 const empty: DesignSettings = { accent: null, heading: null, body: null, bg: null, text: null, radius: null };
 const s = css.indexOf(START);
 if (s === -1) return { settings: empty, rest: css.trim() };
 const jEnd = css.indexOf("*/", s);
 const e = css.indexOf(END);
 let settings = empty;
 if (jEnd !== -1) {
 try { settings = { ...empty, ...JSON.parse(css.slice(s + START.length, jEnd).trim()) }; } catch { /* keep empty */ }
 }
 const rest = (e === -1 ? css.slice(0, s) : css.slice(0, s) + css.slice(e + END.length)).trim();
 return { settings, rest };
}

function colourVars(kind: ThemeKind, bg: string | null, text: string | null, accent: string | null): [string, string][] {
 const v: [string, string][] = [];
 const B = bg ? rgbOf(bg) : null, T = text ? rgbOf(text) : null, A = accent ? rgbOf(accent) : null;
 if (kind === "dawn") {
  const t = (c: Rgb) => c.join(",");
  if (B) v.push(["--color-background", t(B)], ["--gradient-background", bg!], ["--color-secondary-button", t(B)]);
  if (T) v.push(["--color-foreground", t(T)], ["--color-secondary-button-text", t(T)]);
  if (A) v.push(["--color-button", t(A)], ["--color-button-text", t(onColour(A))], ["--color-link", t(A)]);
 } else if (kind === "horizon") {
  const full = (c: Rgb) => `rgb(${c.join(" ")})`, ch = (c: Rgb) => c.join(" ");
  if (B) v.push(["--color-background", full(B)], ["--color-background-rgb", ch(B)]);
  if (T) v.push(["--color-foreground", full(T)], ["--color-foreground-rgb", ch(T)], ["--color-foreground-heading", full(T)], ["--color-foreground-heading-rgb", ch(T)]);
  if (A) {
   const on = onColour(A);
   v.push(["--color-primary", full(A)], ["--color-primary-rgb", ch(A)], ["--color-primary-hover", full(A)], ["--color-primary-hover-rgb", ch(A)]);
   v.push(["--color-primary-button-background", full(A)], ["--color-primary-button-border", full(A)], ["--color-primary-button-text", full(on)]);
   v.push(["--color-primary-button-hover-background", full(A)], ["--color-primary-button-hover-border", full(A)], ["--color-primary-button-hover-text", full(on)]);
   v.push(["--color-secondary-button-text", full(A)], ["--color-secondary-button-border", full(A)]);
  }
 } else if (kind === "squarespace") {
  if (bg) for (const k of ["--siteBackgroundColor", "--solidHeaderBackgroundColor", "--gradientHeaderBackgroundColor", "--menuOverlayBackgroundColor"]) v.push([k, bg]);
  if (text) for (const k of ["--paragraphSmallColor", "--paragraphMediumColor", "--paragraphLargeColor", "--headingSmallColor", "--headingMediumColor", "--headingLargeColor", "--headingExtraLargeColor", "--siteTitleColor", "--navigationLinkColor", "--solidHeaderNavigationColor", "--gradientHeaderNavigationColor", "--menuOverlayNavigationLinkColor"]) v.push([k, text]);
  if (accent && A) {
   const on = toHex(onColour(A));
   for (const k of ["--primaryButtonBackgroundColor", "--secondaryButtonBackgroundColor", "--tertiaryButtonBackgroundColor", "--menuOverlayButtonBackgroundColor", "--paragraphLinkColor", "--headingLinkColor"]) v.push([k, accent]);
   for (const k of ["--primaryButtonTextColor", "--secondaryButtonTextColor", "--tertiaryButtonTextColor", "--menuOverlayButtonTextColor"]) v.push([k, on]);
  }
 }
 return v;
}

const FONT_VARS: Record<ThemeKind, { heading: string[]; body: string[] }> = {
 dawn: { heading: ["--font-heading-family"], body: ["--font-body-family"] },
 horizon: { heading: ["--font-heading--family", "--font-h1--family", "--font-h2--family", "--font-h3--family", "--font-h4--family", "--font-h5--family", "--font-h6--family"], body: ["--font-body--family", "--font-paragraph--family"] },
 squarespace: { heading: ["--heading-font-font-family"], body: ["--body-font-font-family"] },
 generic: { heading: [], body: [] },
};

/** Rebuild the full custom-CSS blob: the generated design block (if any) + preserved rest. `theme` is
 *  what detectThemeModel read off the captured site; without it only the body-level fallback applies. */
export function buildDesignCss(settings: DesignSettings, rest: string, theme?: ThemeModel | null): string {
 const accent = settings.accent && isHex(settings.accent) ? settings.accent : null;
 const bg = settings.bg && isHex(settings.bg) ? settings.bg : null;
 const text = settings.text && isHex(settings.text) ? settings.text : null;
 const heading = settings.heading && isFont(settings.heading) ? settings.heading : null;
 const body = settings.body && isFont(settings.body) ? settings.body : null;
 const radius = settings.radius && RADIUS_PX[settings.radius] !== undefined ? settings.radius : null;
 const cleanRest = rest.trim();
 if (!accent && !heading && !body && !bg && !text && !radius) return cleanRest; // nothing to apply

 const kind: ThemeKind = theme && Object.prototype.hasOwnProperty.call(FONT_VARS, theme.kind) ? theme.kind : "generic";
 const scope = [...new Set([":root", "body", ...(theme?.schemes || []).filter((s) => SAFE_SCOPE.test(s))])].map((s) => s + BOOST).join(",");
 const decls = (pairs: [string, string][]) => pairs.map(([k, val]) => `${k}:${val}!important`).join(";");

 const fonts = [...new Set([heading, body].filter(Boolean) as string[])];
 const imp = fonts.length ? `@import url('https://fonts.googleapis.com/css2?${fonts.map((f) => "family=" + f.replace(/ /g, "+") + ":wght@400;500;600;700").join("&")}&display=swap');\n` : "";
 let block = `${START}${JSON.stringify({ accent, heading, body, bg, text, radius })} */\n${imp}`;

 const fontVars: [string, string][] = [...(heading ? FONT_VARS[kind].heading.map((k): [string, string] => [k, fam(heading)]) : []), ...(body ? FONT_VARS[kind].body.map((k): [string, string] => [k, fam(body)]) : [])];
 if (fontVars.length) block += `:root${BOOST}{${decls(fontVars)}}\n`;
 if (heading) block += `${["h1", "h2", "h3", "h4", "h5", "h6"].map((h) => h + BOOST).join(",")}{font-family:${fam(heading)}!important}\n`;
 if (body) block += `body${BOOST}{font-family:${fam(body)}!important}\n`;

 if (kind === "generic") {
  if (bg) block += `body${BOOST}{background-color:${bg}!important}\n`;
  if (text) block += `body${BOOST}{color:${text}!important}\n`;
  // Theme button classes only — never bare `button`, which is every icon, arrow and VYA's own cart control.
  if (accent) block += `:is(.button,.btn,[type="submit"],.shopify-payment-button__button,.sqs-block-button-element):not([id^="vya-"]):not([id^="vya-"] *){background-color:${accent}!important;border-color:${accent}!important;color:${toHex(onColour(rgbOf(accent)))}!important}\n`;
 } else {
  const vars = colourVars(kind, bg, text, accent);
  if (vars.length) block += `${scope}{${decls(vars)}}\n`;
 }
 if (radius) block += `button,.btn,.button,[type="submit"],input,select,textarea,.card,.product-card{border-radius:${RADIUS_PX[radius]}!important}\n`;
 block += END;
 return cleanRest ? `${block}\n${cleanRest}` : block;
}
