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
 // The paragraph ends, so a gap. Then the bullets run on consecutive lines, because a blank line
 // between every bullet of a spec list is noise.
 assert.equal(lines[1], "", "the paragraph's gap is the seller's own spacing, kept");
 assert.equal(lines[2], "Size", "trailing space trimmed");
 assert.equal(lines[3], "100% Viscose");
 assert.equal(lines[lines.length - 1], "Shoulder to hem 35''");
 assert.ok(!/\n\n\n/.test(out!), "never more than one blank line, whatever the source stacked up");
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

test("a templated listing keeps the blank lines between its sections", () => {
 // One seller's 177 listings are shaped like this, and the gaps are how she wrote them. Closing
 // them turned five sections into one unbroken column that was not what her own site shows.
 const out = cleanDescription(
  "<p>A pink waffle jacket with a two way zip front.</p>" +
  "<p><strong>Era:</strong> 2000s<br><strong>Condition:</strong> Excellent.</p>" +
  "<p><strong>Measurements (laid flat):</strong><br>Bust: 39 cm<br>Waist: 31.5 cm</p>" +
  "<p>Sourced in Milan, Italy.</p>",
 );
 assert.equal(out,
  "A pink waffle jacket with a two way zip front.\n\n" +
  "Era: 2000s\nCondition: Excellent.\n\n" +
  "Measurements (laid flat):\nBust: 39 cm\nWaist: 31.5 cm\n\n" +
  "Sourced in Milan, Italy.");
});
