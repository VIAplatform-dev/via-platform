import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES, CATEGORIES, fillTemplate, templateById } from "./email-templates.ts";

test("every template is complete enough to send without editing", () => {
 for (const t of TEMPLATES) {
  assert.ok(t.subject.trim(), `${t.id} has no subject`);
  assert.ok(t.body.trim(), `${t.id} has no body`);
  assert.ok(t.blurb.trim(), `${t.id} has no blurb for its card`);
  assert.ok(CATEGORIES.includes(t.category), `${t.id} is in a category the picker doesn't show`);
  // Filler is a blank box with extra steps. Square brackets are different and deliberate: they mark
  // the one or two things only the shop knows (a date, a market name), so they're easy to spot and
  // replace. Anything longer than a few words in brackets is us asking her to write the email.
  assert.doesNotMatch(`${t.subject} ${t.body}`, /lorem|ipsum/i, `${t.id} contains filler`);
  for (const m of `${t.subject} ${t.body}`.matchAll(/\[([^\]]+)\]/g)) {
   assert.ok(m[1].length <= 42, `${t.id} asks the seller to write too much: "${m[1]}"`);
  }
 }
});

test("ids are unique, or the picker selects the wrong one", () => {
 assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, TEMPLATES.length);
});

test("only tokens we know how to fill are used", () => {
 const known = new Set(["store", "piece", "count", "code"]);
 for (const t of TEMPLATES) {
  for (const m of `${t.subject} ${t.body}`.matchAll(/\{(\w+)\}/g)) {
   assert.ok(known.has(m[1]), `${t.id} uses {${m[1]}}, which nothing fills`);
  }
 }
});

test("tokens are filled from the store's own data", () => {
 assert.equal(fillTemplate("{count} new pieces just landed.", { count: 4 }), "4 new pieces just landed.");
 assert.equal(fillTemplate("{store} is open.", { store: "Situations Vintage" }), "Situations Vintage is open.");
});

test("a line we can't fill is dropped, never left with braces showing", () => {
 // "{piece} has just come in." with no piece is not a sentence, and {piece} in a draft is a chore.
 const out = fillTemplate("{piece} has just come in.\nOne of one.", { piece: null });
 assert.equal(out, "One of one.");
 assert.doesNotMatch(out, /\{/);
});

test("a missing store name falls back to something sayable", () => {
 assert.equal(fillTemplate("{store} is open.", {}), "our shop is open.");
});

test("every category has something in it, so no tab opens empty", () => {
 for (const c of CATEGORIES) {
  assert.ok(TEMPLATES.some((t) => t.category === c), `${c} has no templates`);
 }
});

test("templates are found by id", () => {
 assert.equal(templateById("just-landed")?.name, "New arrivals");
 assert.equal(templateById("nope"), null);
});

test("every template names a design, and the designs are actually used", () => {
 const known = new Set(["classic", "statement", "photo", "editorial", "grid"]);
 for (const t of TEMPLATES) assert.ok(known.has(t.design), `${t.id} has no usable design`);
 // A gallery where every card is the same layout is a list. At least four of the five in use.
 assert.ok(new Set(TEMPLATES.map((t) => t.design)).size >= 4, "the gallery isn't varied enough to be a gallery");
});

test("a design that needs a photo is only given to a template that carries pieces", () => {
 // "photo" leads with the first piece full-bleed. With no pieces it opens on nothing.
 for (const t of TEMPLATES.filter((x) => x.design === "photo" || x.design === "grid")) {
  assert.equal(t.pieces, "new", `${t.id} uses ${t.design} but carries no pieces`);
 }
});


test("the copy stays plain — a starting point isn't a piece of writing", () => {
 // Anything clever is something the shop owner has to delete before she can use it. Two short
 // lines is the whole budget.
 for (const t of TEMPLATES) {
  const lines = t.body.split("\n").filter(Boolean);
  assert.ok(lines.length <= 3, `${t.id} has ${lines.length} lines — too much to read past`);
  for (const l of lines) {
   assert.ok(l.length <= 95, `${t.id} has a ${l.length}-character line: "${l}"`);
  }
  assert.ok(t.subject.length <= 60, `${t.id}'s subject is ${t.subject.length} characters — it'll be cut off`);
 }
});

test("there's enough here to be worth browsing", () => {
 assert.ok(TEMPLATES.length >= 18, `only ${TEMPLATES.length} templates`);
 for (const c of CATEGORIES) {
  assert.ok(TEMPLATES.filter((t) => t.category === c).length >= 3, `${c} has too few to fill a row`);
 }
});
