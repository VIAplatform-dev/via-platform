import test from "node:test";
import assert from "node:assert/strict";
import { policyLinks, policyLabel, isPolicySlug, policyParagraphs, POLICY_SLUGS } from "./policy-pages.ts";

test("only policies she has actually written are linked", () => {
 // A footer link to a blank page is worse than no link: a shopper clicks it to find out where she
 // stands and learns nothing.
 const links = policyLinks({ returns: "We take returns within 14 days.", shipping: "   ", privacy: "", terms: null as never });
 assert.deepEqual(links, [{ label: "Returns", href: "/returns" }]);
 assert.deepEqual(policyLinks({}), []);
 assert.deepEqual(policyLinks(null), []);
});

test("the links are in a fixed order, not the order she happened to write them", () => {
 const all = policyLinks({ terms: "t", privacy: "p", shipping: "s", returns: "r" });
 assert.deepEqual(all.map((l) => l.label), ["Returns", "Shipping", "Privacy", "Terms"]);
});

test("they resolve on her own domain and on ours", () => {
 assert.equal(policyLinks({ returns: "r" })[0].href, "/returns", "her own domain");
 assert.equal(policyLinks({ returns: "r" }, "/s/blummier")[0].href, "/s/blummier/returns", "ours");
});

test("a seller previewing an unpublished shop does not fall off it", () => {
 // Without the flag she clicks Returns on her own preview and lands on a 404 or a live-only page.
 assert.equal(policyLinks({ returns: "r" }, "/s/x", true)[0].href, "/s/x/returns?preview=1");
});

test("a policy slug is recognised and nothing else is", () => {
 for (const s of POLICY_SLUGS) assert.equal(isPolicySlug(s), true, s);
 for (const s of ["about", "shop", "contact", "", null, 7, "Returns"]) assert.equal(isPolicySlug(s), false, String(s));
});

test("every slug has a label, so no footer link can render blank", () => {
 for (const s of POLICY_SLUGS) assert.ok(policyLabel(s).length > 2, s);
});

test("a blank line is a paragraph and a single newline is not", () => {
 // She types into a textarea. Getting this wrong either runs it all together or double-spaces it.
 const out = policyParagraphs("We accept returns within 14 days.\nPostage is yours.\n\nSale pieces are final.");
 assert.equal(out.length, 2);
 assert.equal(out[0], "We accept returns within 14 days.\nPostage is yours.");
 assert.equal(out[1], "Sale pieces are final.");
});

test("an empty policy yields no paragraphs at all", () => {
 assert.deepEqual(policyParagraphs(""), []);
 assert.deepEqual(policyParagraphs(null), []);
 assert.deepEqual(policyParagraphs("   \n\n  "), []);
});

test("windows line endings do not create phantom paragraphs", () => {
 assert.deepEqual(policyParagraphs("One.\r\n\r\nTwo."), ["One.", "Two."]);
});
