import { test } from "node:test";
import assert from "node:assert/strict";
import { cartSubmitAction } from "./cart-submit.ts";

// Shopify's cart form is ONE form with TWO submit buttons — `checkout` and `update`. Which one the
// shopper pressed is carried only by which name appears in the body, so this decision is the whole
// difference between "take my money" and "recalculate my bag".
test("the checkout button starts a checkout", () => {
 assert.deepEqual(cartSubmitAction({ checkout: "" }), { kind: "checkout" });
 assert.deepEqual(cartSubmitAction({ checkout: "Check out" }), { kind: "checkout" });
});

test("the update button does not", () => {
 assert.equal(cartSubmitAction({ update: "Update" }).kind, "update");
});

// A bare POST /cart with neither name is Shopify's own "just recalculate" — never a checkout.
// Guessing checkout here would charge a shopper who only changed a quantity.
test("a body with neither button is an update, never a checkout", () => {
 assert.equal(cartSubmitAction({}).kind, "update");
 assert.equal(cartSubmitAction({ note: "gift wrap please" }).kind, "update");
});

test("checkout wins when a theme sends both", () => {
 assert.deepEqual(cartSubmitAction({ checkout: "", update: "Update" }), { kind: "checkout" });
});

test("reads quantity-zero lines out of the positional updates[] form", () => {
 // updates[]=1&updates[]=0&updates[]=1 — the second line was zeroed.
 const a = cartSubmitAction({ update: "", "updates[]": ["1", "0", "1"] });
 assert.deepEqual(a, { kind: "update", removeLines: [2] });
});

test("reads them out of the indexed updates[n] form too", () => {
 const a = cartSubmitAction({ "updates[1]": "1", "updates[2]": "0", "updates[3]": "0" });
 assert.deepEqual(a, { kind: "update", removeLines: [2, 3] });
});

test("a single-valued updates[] still parses", () => {
 assert.deepEqual(cartSubmitAction({ "updates[]": "0" }), { kind: "update", removeLines: [1] });
});

test("an update that removes nothing removes nothing", () => {
 assert.deepEqual(cartSubmitAction({ update: "", "updates[]": ["1", "1"] }), { kind: "update", removeLines: [] });
});

// One-of-one stock: a theme optimistically asking for 2 must not be read as "remove", and must not
// throw either — it is simply not a removal.
test("quantities above one are not removals", () => {
 assert.deepEqual(cartSubmitAction({ "updates[]": ["2", "5"] }), { kind: "update", removeLines: [] });
});

test("junk quantities are ignored rather than treated as zero", () => {
 assert.deepEqual(cartSubmitAction({ "updates[]": ["", "abc", "0"] }), { kind: "update", removeLines: [3] });
});

test("the line-and-quantity pair form is honoured", () => {
 // Dawn's cart-remove-button posts { line: "2", quantity: 0 } to /cart/change, but some themes
 // send the same pair to /cart.
 assert.deepEqual(cartSubmitAction({ line: "2", quantity: "0" }), { kind: "update", removeLines: [2] });
 assert.deepEqual(cartSubmitAction({ line: "2", quantity: "1" }), { kind: "update", removeLines: [] });
});
