import { test } from "node:test";
import assert from "node:assert/strict";
import { orderFieldsForPanel, splitFocusedFields, type OrderableField } from "./panel-field-order.ts";

const text = (eid: number, value: string, tag = "a"): OrderableField => ({ kind: "text", eid, value, tag });
const link = (id: number, href: string, label: string): OrderableField => ({ kind: "link", id, href, label });

test("a link's destination sits directly under its words", () => {
 const fields = [
  text(1, "Return Policy"),
  text(2, "Make an appointment here."),
  link(10, "/policies/refund-policy", "Return Policy"),
  link(11, "/products/appointment", "Make an appointment here."),
 ];
 const order = orderFieldsForPanel(fields).map((x) => x.f);
 assert.equal((order[0] as { value: string }).value, "Return Policy");
 assert.equal((order[1] as { href: string }).href, "/policies/refund-policy");
 assert.equal((order[2] as { value: string }).value, "Make an appointment here.");
 assert.equal((order[3] as { href: string }).href, "/products/appointment");
});

test("the original index travels with the field, because edits address the page by it", () => {
 const fields = [text(1, "About"), text(2, "Journal"), link(10, "/pages/about", "About")];
 const order = orderFieldsForPanel(fields);
 const linkEntry = order.find((x) => x.f.kind === "link")!;
 assert.equal(linkEntry.i, 2, "the link is still index 2, wherever it is shown");
});

test("nothing is dropped, and nothing is duplicated", () => {
 const fields = [text(1, "A"), link(10, "/a", "A"), text(2, "B"), link(11, "/b", "Nowhere")];
 const order = orderFieldsForPanel(fields);
 assert.equal(order.length, fields.length);
 assert.equal(new Set(order.map((x) => x.i)).size, fields.length);
});

test("a link whose words aren't on the page is still editable, at the end", () => {
 const fields = [text(1, "About"), link(10, "/orphan", "Not on this page")];
 const order = orderFieldsForPanel(fields);
 assert.equal(order.length, 2);
 assert.equal((order[1].f as { href: string }).href, "/orphan");
});

test("two links with the same words pair one each, not both to the first", () => {
 const fields = [
  text(1, "Shop"), text(2, "Shop"),
  link(10, "/shop-one", "Shop"), link(11, "/shop-two", "Shop"),
 ];
 const order = orderFieldsForPanel(fields).map((x) => x.f);
 assert.equal((order[1] as { href: string }).href, "/shop-one");
 assert.equal((order[3] as { href: string }).href, "/shop-two");
});

test("matching ignores case and stray whitespace, as captured markup is full of both", () => {
 const fields = [text(1, "  Return   Policy "), link(10, "/refund", "return policy")];
 const order = orderFieldsForPanel(fields);
 assert.equal(order[1].f.kind, "link");
});

test("images and headings keep their place", () => {
 const fields: OrderableField[] = [
  { kind: "text", eid: 1, value: "SHOP", tag: "h3" },
  { kind: "image", id: 5, src: "/a.jpg" },
  text(2, "New"),
  link(10, "/new", "New"),
 ];
 const order = orderFieldsForPanel(fields).map((x) => x.f.kind);
 assert.deepEqual(order, ["text", "image", "text", "link"]);
});

test("clicking one title shows that title, not the other thirty-nine", () => {
 const fields = [
  text(1, "Antique"), link(10, "/collections/antique", "Antique"),
  text(2, "Bottoms"), link(11, "/collections/bottoms", "Bottoms"),
  text(3, "Collars"), link(12, "/collections/collars", "Collars"),
 ];
 const ordered = orderFieldsForPanel(fields);
 const { focused, rest } = splitFocusedFields(ordered, 2);
 assert.equal(focused.length, 2, "the words and where they go");
 assert.equal((focused[0].f as { value: string }).value, "Bottoms");
 assert.equal((focused[1].f as { href: string }).href, "/collections/bottoms");
 assert.equal(rest.length, 4, "the others are still there, just not first");
});

test("a focused field with no link takes only itself", () => {
 const fields = [text(1, "Heading", "h2"), text(2, "Body", "p")];
 const { focused } = splitFocusedFields(orderFieldsForPanel(fields), 1);
 assert.equal(focused.length, 1);
});

test("no element clicked shows the whole section, as before", () => {
 const fields = [text(1, "A"), link(10, "/a", "A")];
 const { focused, rest } = splitFocusedFields(orderFieldsForPanel(fields), null);
 assert.equal(focused.length, 0);
 assert.equal(rest.length, 2);
});

test("clicking something that isn't in this section changes nothing", () => {
 const fields = [text(1, "A"), link(10, "/a", "A")];
 const { focused, rest } = splitFocusedFields(orderFieldsForPanel(fields), 999);
 assert.equal(focused.length, 0);
 assert.equal(rest.length, 2);
});

test("nothing is lost between focused and rest", () => {
 const fields = [text(1, "A"), link(10, "/a", "A"), text(2, "B"), link(11, "/b", "B"), text(3, "C")];
 const ordered = orderFieldsForPanel(fields);
 const { focused, rest } = splitFocusedFields(ordered, 2);
 assert.equal(focused.length + rest.length, fields.length);
 assert.equal(new Set([...focused, ...rest].map((x) => x.i)).size, fields.length);
});

// ── the clicked picture ────────────────────────────────────────────────────────────────────────
// A collection tile is a photograph, so clicking one used to list every photo in the row.
test("a clicked image narrows the panel to that image", () => {
 const fields: OrderableField[] = [
  { kind: "image", id: 1, src: "a.jpg" },
  { kind: "image", id: 2, src: "b.jpg" },
  { kind: "image", id: 3, src: "c.jpg" },
 ];
 const ordered = orderFieldsForPanel(fields);
 const { focused, rest } = splitFocusedFields(ordered, null, 2);
 assert.equal(focused.length, 1);
 assert.equal(focused[0].f.kind === "image" && focused[0].f.id, 2);
 assert.equal(rest.length, 2);
});

test("the clicked image keeps its original index, which is how the edit reaches it", () => {
 const fields: OrderableField[] = [
  { kind: "text", eid: 7, value: "Shop", tag: "h2" },
  { kind: "image", id: 1, src: "a.jpg" },
  { kind: "image", id: 2, src: "b.jpg" },
 ];
 const { focused } = splitFocusedFields(orderFieldsForPanel(fields), null, 2);
 assert.equal(focused[0].i, 2);
});

test("an image id that isn't in this section falls back to the whole list", () => {
 const fields: OrderableField[] = [{ kind: "image", id: 1, src: "a.jpg" }];
 const { focused, rest } = splitFocusedFields(orderFieldsForPanel(fields), null, 99);
 assert.equal(focused.length, 0);
 assert.equal(rest.length, 1);
});

test("a clicked image wins over a stale text focus", () => {
 const fields: OrderableField[] = [
  { kind: "text", eid: 7, value: "Shop", tag: "h2" },
  { kind: "image", id: 2, src: "b.jpg" },
 ];
 const { focused } = splitFocusedFields(orderFieldsForPanel(fields), 7, 2);
 assert.equal(focused[0].f.kind, "image");
});
