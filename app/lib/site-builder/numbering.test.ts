import { test } from "node:test";
import assert from "node:assert/strict";
import { numberingMismatch, EDITOR_NUMBERING } from "./numbering.ts";

test("a section save from an editor counted under the old rule is refused", () => {
 assert.equal(numberingMismatch({ sections: [0, 1] }), true);
 assert.equal(numberingMismatch({ sections: [0, 1], numbering: 1 }), true);
 assert.equal(numberingMismatch({ secStyles: [{ sec: 1, style: "color:red" }] }), true);
 assert.equal(numberingMismatch({ deleteSecs: [2] }), true);
});

test("the current rule passes", () => {
 assert.equal(numberingMismatch({ sections: [0, 1], numbering: EDITOR_NUMBERING }), false);
});

test("text, image and link edits never address sections, so an older tab can still save them", () => {
 assert.equal(numberingMismatch({ edits: [{ eid: 3, text: "x", was: "y" }], secStyles: [], deleteSecs: [] }), false);
 assert.equal(numberingMismatch(null), false);
});
