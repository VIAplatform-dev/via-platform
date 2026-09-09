import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSiteFonts } from "./font-detect.ts";

const fams = (css: string) => detectSiteFonts(css).map((f) => f.family);

test("finds the face a site ships", () => {
 const css = `@font-face{font-family:"Peignot";src:url(/p.woff2)}h1{font-family:"Peignot",serif}`;
 assert.deepEqual(fams(css), ["Peignot"]);
});

test("a shipped face outranks one that is only named", () => {
 const css = `@font-face{font-family:Peignot;src:url(p.woff2)}
  body{font-family:"Söhne",sans-serif}p{font-family:"Söhne",sans-serif}h1{font-family:Peignot}`;
 assert.deepEqual(fams(css), ["Peignot", "Söhne"]);
});

test("generic categories and the system stack are not fonts", () => {
 const css = `body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}`;
 assert.deepEqual(fams(css), []);
});

test("only the head of a stack counts, never its fallbacks", () => {
 const css = `h1{font-family:"Canela","Georgia",serif}h2{font-family:"Canela",serif}`;
 assert.deepEqual(fams(css), ["Canela"]);
});

test("the same face in different cases is one entry", () => {
 const css = `h1{font-family:"Canela"}h2{font-family:canela}h3{font-family:CANELA}`;
 const out = detectSiteFonts(css);
 assert.equal(out.length, 1);
 assert.equal(out[0].declared, 3);
});

test("most-declared comes first", () => {
 const css = `h1{font-family:"Rare"}p{font-family:"Common"}li{font-family:"Common"}a{font-family:"Common"}`;
 assert.deepEqual(fams(css), ["Common", "Rare"]);
});

test("a CSS variable is not a face", () => {
 const css = `h1{font-family:var(--font-heading)}`;
 assert.deepEqual(fams(css), []);
});

test("the font shorthand is read too", () => {
 const css = `h1{font:italic 700 1rem/1.2 "Peignot", serif}`;
 assert.deepEqual(fams(css), ["Peignot"]);
});

test("unquoted multi-word families survive", () => {
 assert.deepEqual(fams(`h1{font-family:Nimbus Sans Extended, sans-serif}`), ["Nimbus Sans Extended"]);
});

test("a face is flagged when the stylesheet ships it", () => {
 const css = `@font-face{font-family:"Peignot";src:url(p.woff2)}h1{font-family:"Peignot"}h2{font-family:"Borrowed"}`;
 const out = detectSiteFonts(css);
 assert.equal(out.find((f) => f.family === "Peignot")?.face, true);
 assert.equal(out.find((f) => f.family === "Borrowed")?.face, false);
});

test("empty CSS finds nothing rather than throwing", () => {
 assert.deepEqual(detectSiteFonts(""), []);
 assert.deepEqual(detectSiteFonts(null as unknown as string), []);
});

test("the list is capped", () => {
 const css = Array.from({ length: 40 }, (_v, i) => `.c${i}{font-family:"Face ${i}"}`).join("");
 assert.equal(detectSiteFonts(css).length, 12);
 assert.equal(detectSiteFonts(css, 3).length, 3);
});

test("a theme's whole stylesheet yields its real faces", () => {
 const css = `
  @font-face{font-family:'Futura PT';src:url(/f.woff2) format('woff2');font-weight:400}
  @font-face{font-family:'Futura PT';src:url(/fb.woff2) format('woff2');font-weight:700}
  :root{--f-heading:'Canela'}
  body{font-family:'Futura PT',-apple-system,sans-serif;font-size:16px}
  h1,h2{font-family:'Canela',Georgia,serif}
  .price{font-family:'Futura PT',sans-serif}`;
 assert.deepEqual(fams(css), ["Futura PT", "Canela"]);
});
