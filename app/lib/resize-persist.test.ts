import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { applyEdits, prepareEditMode } from "./site-capture.ts";

const PAGE = `<html><body><main><section><h2>About</h2><img src="a.jpg"></section></main></body></html>`;
// The editor's own ids, so a test asks for the same element the browser would.
const ids = () => {
 const $ = cheerio.load(prepareEditMode(PAGE, "s", "/"));
 return { img: Number($("img[data-vya-img]").first().attr("data-vya-img")), eid: Number($("h2[data-vya-eid]").first().attr("data-vya-eid")) };
};

test("a resized image keeps its width through the save", () => {
 const { img } = ids();
 const $ = cheerio.load(applyEdits(PAGE, { imgStyles: [{ id: img, style: "width:45% !important;" }] }));
 assert.match($("img").attr("style") || "", /width:\s*45%/);
});

test("a resized text element keeps its width too", () => {
 const { eid } = ids();
 const $ = cheerio.load(applyEdits(PAGE, { styles: [{ eid, style: "width:60% !important;" }] }));
 assert.match($("h2").attr("style") || "", /width:\s*60%/);
});

test("height is refused — a captured layout sets its own, and overriding one squashes the photo", () => {
 const { img } = ids();
 const $ = cheerio.load(applyEdits(PAGE, { imgStyles: [{ id: img, style: "height:20px;width:45%;" }] }));
 const style = $("img").attr("style") || "";
 assert.match(style, /width:\s*45%/);
 assert.doesNotMatch(style, /height/);
});

test("a width edit doesn't disturb a style the theme already set", () => {
 const withStyle = `<html><body><main><section><img src="a.jpg" style="border-radius:8px"></section></main></body></html>`;
 const id = Number(cheerio.load(prepareEditMode(withStyle, "s", "/"))("img[data-vya-img]").attr("data-vya-img"));
 const $ = cheerio.load(applyEdits(withStyle, { imgStyles: [{ id, style: "width:30% !important;" }] }));
 const style = $("img").attr("style") || "";
 assert.match(style, /border-radius/);
 assert.match(style, /width:\s*30%/);
});

test("an id from another page writes nothing", () => {
 const $ = cheerio.load(applyEdits(PAGE, { imgStyles: [{ id: 999, style: "width:10%;" }] }));
 assert.equal(/width/.test($("img").attr("style") || ""), false);
});

test("the handle and its style map are on the served page", () => {
 const out = prepareEditMode(PAGE, "s", "/");
 assert.ok(out.includes("vya-rz"));
 assert.ok(out.includes("dimgstyle"));
});
