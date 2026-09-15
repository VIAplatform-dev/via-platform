import test from "node:test";
import assert from "node:assert/strict";
import { placeholderProps } from "./storefront-placeholder-copy.ts";
import { templatePages, STOREFRONT_TEMPLATES } from "./storefront-templates.ts";

// What a seller sees on a template page before she has written a word. It is the only copy on the
// page, so it has to be copy about THAT page: the questions on Authentication were "Can I return
// something?", and the three columns under "How we check" were "Made with care / One of a kind /
// Fast delivery".

const qs = (props: Record<string, string>) =>
 Object.keys(props).filter((k) => /^q\d+$/.test(k)).sort().map((k) => props[k]);

test("a question block answers the page it is on", () => {
 const six = Object.fromEntries([0, 1, 2, 3, 4, 5].flatMap((i) => [[`q${i}`, "?"], [`a${i}`, "."]]));
 const auth = qs(placeholderProps("faq", six, 0, "authentication")!);
 assert.ok(auth.every((q) => !/delivery|return|ship/i.test(q)), `postage on an authentication page: ${auth.join(" / ")}`);
 assert.ok(auth.some((q) => /real|sure|authenticat/i.test(q)));

 const ship = qs(placeholderProps("faq", six, 0, "shipping")!);
 assert.ok(ship.some((q) => /delivery/i.test(q)));
 assert.ok(ship.some((q) => /return/i.test(q)));
});

test("no question is asked twice on one page", () => {
 // Six slots against a four-row list printed "How long does delivery take?" twice, one card under
 // the other, on every template with a six-question layout.
 const six = Object.fromEntries([0, 1, 2, 3, 4, 5].flatMap((i) => [[`q${i}`, "?"], [`a${i}`, "."]]));
 for (const page of ["faq", "authentication", "shipping", "condition", "sizing"]) {
  const list = qs(placeholderProps("faq", six, 0, page)!);
  assert.equal(new Set(list).size, list.length, `${page}: ${list.join(" / ")}`);
 }
});

test("the FAQ page's paragraph is about questions, not about the shop", () => {
 const p = placeholderProps("text", { heading: "x", body: "y" }, 0, "faq")!;
 assert.equal(p.heading, "Questions");
 assert.ok(!/who you are and what you sell/i.test(p.body), p.body);
});

test("three columns on a page say what that page is about", () => {
 const items = "A | B | | | \nC | D | | | \nE | F | | | ";
 const auth = placeholderProps("columns", { items }, 0, "authentication")!.items;
 assert.ok(!/fast delivery|one of a kind/i.test(auth), auth);
 assert.ok(/checked in hand/i.test(auth), auth);
 // A page with no opinion still gets the generic set, which is the old behaviour.
 assert.ok(/made with care/i.test(placeholderProps("columns", { items }, 0, "home")!.items));
});

test("every template page, as shipped, talks about itself", () => {
 // The end-to-end version of the three tests above, run over the real templates so a new page or a
 // new auth style cannot quietly reintroduce the problem.
 const OFF_TOPIC: Record<string, RegExp> = {
  authentication: /delivery|internationally|one of a kind|fast delivery/i,
  shipping: /one of a kind|made with care/i,
 };
 for (const t of STOREFRONT_TEMPLATES) {
  for (const pg of templatePages(t.id)) {
   const bad = OFF_TOPIC[pg.slug];
   if (!bad) continue;
   for (const b of pg.blocks) {
    const props = (b.props ?? {}) as Record<string, string>;
    for (const k of Object.keys(props)) {
     if (!/^q\d+$/.test(k) && k !== "items") continue;
     assert.ok(!bad.test(String(props[k])), `${t.id}/${pg.slug} ${k}: ${props[k]}`);
    }
   }
  }
 }
});
