import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDescription } from "./clean-description.ts";

test("cleanDescription turns imported Shopify HTML into clean, one-per-line text", () => {
 const html = `<p>This Reiss mini dress is giving major it-girl energy with its bold pattern.</p>
<ul>
<li>Size </li>
<li>100% Viscose </li>
<li>Invisible back zipper </li>
<li>Bust 33''</li>
<li>Shoulder to hem 35''</li>
</ul>`;
 const out = cleanDescription(html);
 assert.ok(out && !/[<>]/.test(out), "no HTML tags remain");
 const lines = out!.split("\n");
 assert.equal(lines[0], "This Reiss mini dress is giving major it-girl energy with its bold pattern.");
 assert.equal(lines[1], "Size", "trailing space trimmed");
 assert.equal(lines[2], "100% Viscose");
 assert.equal(lines[lines.length - 1], "Shoulder to hem 35''");
 assert.ok(!/\n\n/.test(out!), "no blank-line gaps");
});

test("cleanDescription decodes entities and handles <br>", () => {
 const out = cleanDescription("Cotton &amp; silk blend<br>Made in Italy");
 assert.equal(out, "Cotton & silk blend\nMade in Italy");
});

test("cleanDescription passes plain text through and nulls empties", () => {
 assert.equal(cleanDescription("Just plain text."), "Just plain text.");
 assert.equal(cleanDescription("<p></p>  "), null);
 assert.equal(cleanDescription(null), null);
});
