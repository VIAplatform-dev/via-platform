import { test } from "node:test";
import assert from "node:assert/strict";
import {
 resolveProductPage, visibleFields, reorderFields, buttonCss, canChip, BUILTIN_SLOTS,
 DEFAULT_PRODUCT_PAGE, DEFAULT_ASSURANCE, DEFAULT_BACK_LABEL, DEFAULT_BUTTONS,
 type ProductPageConfig,
} from "./storefront-product-page.ts";

const facts = {
 brand: "Alexander Wang", era: "2000s", material: "Calf leather", condition: "Excellent",
 origin: "Italy", size: "6", description: "A bucket bag.", measurements: "Strap 22in",
};

test("a store that has never touched it gets today's page", () => {
 const c = resolveProductPage(null);
 const shown = visibleFields(c, facts).map((f) => f.key);
 assert.deepEqual(shown, ["size", "description", "measurements"]);
 assert.equal(c.assurance, DEFAULT_ASSURANCE);
 assert.equal(c.backLabel, DEFAULT_BACK_LABEL);
 assert.equal(c.comparePrice, false);
});

test("the fields a listing already carries can be switched on", () => {
 const c = resolveProductPage({
  fields: [{ key: "brand", show: true, mode: "inline" }, { key: "condition", show: true, mode: "drawer" }],
 });
 const shown = visibleFields(c, facts);
 // The two named come first, in the order given; the rest keep their defaults behind them.
 assert.deepEqual(shown.map((f) => f.key), ["brand", "condition", "size", "description", "measurements"]);
 assert.equal(shown[1].mode, "drawer");
});

test("an empty field leaves no heading behind", () => {
 const c = resolveProductPage(null);
 assert.deepEqual(visibleFields(c, { description: "Just this." }).map((f) => f.key), ["description"]);
 // Whitespace is not content.
 assert.deepEqual(visibleFields(c, { description: "   " }).map((f) => f.key), []);
});

test("a seller's own label wins, and a blank one falls back to ours", () => {
 const c = resolveProductPage({ fields: [{ key: "measurements", show: true, mode: "inline", label: "Fit & sizing" }] });
 assert.equal(visibleFields(c, facts).find((f) => f.key === "measurements")?.label, "Fit & sizing");
 const d = resolveProductPage({ fields: [{ key: "measurements", show: true, mode: "inline", label: "   " }] });
 assert.equal(visibleFields(d, facts).find((f) => f.key === "measurements")?.label, "Measurements");
});

test("emptying a sentence hides it — it does not fall back to ours", () => {
 const c = resolveProductPage({ assurance: "", backLabel: "" });
 assert.equal(c.assurance, "");
 assert.equal(c.backLabel, "");
});

test("a missing sentence still takes ours", () => {
 assert.equal(resolveProductPage({ comparePrice: true }).assurance, DEFAULT_ASSURANCE);
});

test("a field that isn't ours is dropped rather than thrown", () => {
 const c = resolveProductPage({ fields: [{ key: "sneaky", show: true, mode: "inline" }] as unknown as ProductPageConfig["fields"] });
 assert.equal(c.fields.length, DEFAULT_PRODUCT_PAGE.fields.length);
 assert.ok(!c.fields.some((f) => String(f.key) === "sneaky"));
});

test("a field named twice is kept once, at its first position", () => {
 const c = resolveProductPage({
  fields: [{ key: "brand", show: true, mode: "inline" }, { key: "brand", show: false, mode: "drawer" }],
 });
 assert.equal(c.fields.filter((f) => f.key === "brand").length, 1);
 assert.equal(c.fields[0].show, true);
});

test("a config saved before a new field existed still gets it", () => {
 // Exactly what a stored blob looked like when only three fields shipped.
 const c = resolveProductPage({ fields: [{ key: "description", show: true, mode: "inline" }] });
 assert.ok(c.fields.some((f) => f.key === "origin"));
 assert.equal(c.fields.find((f) => f.key === "origin")?.show, false);
});

test("reordering moves one field and leaves the rest in order", () => {
 const f = DEFAULT_PRODUCT_PAGE.fields;
 const moved = reorderFields(f, 2, 0);
 assert.deepEqual(moved.map((x) => x.key).slice(0, 3), ["measurements", "size", "description"]);
 // Out of range is a no-op, not a crash or a truncated list.
 assert.equal(reorderFields(f, 0, 99), f);
 assert.equal(reorderFields(f, -1, 0), f);
});

test("the order a seller arranges is the order that survives a save", () => {
 const arranged = resolveProductPage({
  fields: [
   { key: "measurements", show: true, mode: "drawer" },
   { key: "description", show: true, mode: "inline" },
   { key: "size", show: true, mode: "inline" },
  ],
 });
 const round = resolveProductPage(arranged);
 assert.deepEqual(round.fields.map((f) => f.key).slice(0, 3), ["measurements", "description", "size"]);
 assert.equal(round.fields[0].mode, "drawer");
});

test("a chip is allowed for a short value and refused for prose", () => {
 assert.equal(canChip("size"), true);
 assert.equal(canChip("description"), false);
 const c = resolveProductPage({
  fields: [{ key: "size", show: true, mode: "chip" }, { key: "description", show: true, mode: "chip" }],
 });
 assert.equal(c.fields.find((f) => f.key === "size")?.mode, "chip");
 // Refused, not silently kept — a paragraph in a pill is a paragraph with a border round it.
 assert.equal(c.fields.find((f) => f.key === "description")?.mode, "inline");
});

test("chip survives a save, and shows up on the rendered field", () => {
 const c = resolveProductPage(resolveProductPage({ fields: [{ key: "size", show: true, mode: "chip" }] }));
 assert.equal(visibleFields(c, { size: "6" })[0].mode, "chip");
});

test("untouched buttons emit no CSS at all", () => {
 assert.equal(buttonCss(DEFAULT_BUTTONS, "#5D0F17"), "");
 assert.equal(buttonCss(resolveProductPage(null).buttons, "#5D0F17"), "");
});

test("a solid button takes the colours it was given, and the accent when it wasn't", () => {
 const css = buttonCss({ ...DEFAULT_BUTTONS, uppercase: false }, "#5D0F17");
 assert.match(css, /\.vya-pp \.vya-cta\{/);
 assert.match(css, /background:#5D0F17!important/);
 assert.match(css, /text-transform:none!important/);
 const own = buttonCss({ ...DEFAULT_BUTTONS, bg: "#123456", text: "#ffeedd" }, "#5D0F17");
 assert.match(own, /background:#123456!important/);
 assert.match(own, /color:#ffeedd!important/);
});

test("an outline button drops the fill and borrows its own colour for the text", () => {
 const css = buttonCss({ ...DEFAULT_BUTTONS, fill: "outline", bg: "#123456" }, "#5D0F17");
 assert.match(css, /background:transparent!important/);
 assert.match(css, /color:#123456!important/);
 assert.match(css, /border:1px solid #123456!important/);
});

test("tracking is written in em, and clamped", () => {
 assert.match(buttonCss({ ...DEFAULT_BUTTONS, tracking: 0 }, "#000000"), /letter-spacing:0\.00em!important/);
 assert.equal(resolveProductPage({ buttons: { ...DEFAULT_BUTTONS, tracking: 9999 } }).buttons.tracking, 60);
 assert.equal(resolveProductPage({ buttons: { ...DEFAULT_BUTTONS, tracking: -5 } }).buttons.tracking, 0);
});

test("a colour that isn't a hex is dropped rather than written into a stylesheet", () => {
 const c = resolveProductPage({ buttons: { ...DEFAULT_BUTTONS, bg: "red; } body { display:none" } as never });
 assert.equal(c.buttons.bg, null);
 assert.equal(buttonCss(c.buttons, "#5D0F17"), "");
});

test("button corners follow the store until they're set, then don't", () => {
 // Default: no radius rule at all, so the store's corner style keeps governing.
 assert.equal(buttonCss({ ...DEFAULT_BUTTONS, uppercase: false }, "#5D0F17").includes("border-radius"), false);
 assert.match(buttonCss({ ...DEFAULT_BUTTONS, radius: 999 }, "#5D0F17"), /border-radius:999px!important/);
 // A pill on a store whose photographs stay square is the whole point of it being separate.
 assert.match(buttonCss({ ...DEFAULT_BUTTONS, radius: 0 }, "#5D0F17"), /border-radius:0px!important/);
});

test("a radius alone counts as a change worth emitting", () => {
 assert.notEqual(buttonCss({ ...DEFAULT_BUTTONS, radius: 999 }, "#5D0F17"), "");
});

test("a nonsense radius falls back to following the store, and a huge one is clamped", () => {
 assert.equal(resolveProductPage({ buttons: { ...DEFAULT_BUTTONS, radius: "pill" } as never }).buttons.radius, null);
 assert.equal(resolveProductPage({ buttons: { ...DEFAULT_BUTTONS, radius: 99999 } }).buttons.radius, 999);
 assert.equal(resolveProductPage({ buttons: { ...DEFAULT_BUTTONS, radius: -20 } }).buttons.radius, 0);
});

test("a store that has never touched it gets today's order", () => {
 assert.deepEqual(resolveProductPage(null).slots.map((s) => s.kind), BUILTIN_SLOTS);
 assert.ok(resolveProductPage(null).slots.every((s) => s.show));
});

test("the seller's order is what survives", () => {
 const c = resolveProductPage({
  slots: [
   { id: "buy", kind: "buy", show: true },
   { id: "price", kind: "price", show: true },
   { id: "title", kind: "title", show: true },
  ],
 });
 // Their three first, in their order; the built-ins they didn't mention follow.
 assert.deepEqual(c.slots.map((s) => s.kind).slice(0, 3), ["buy", "price", "title"]);
 assert.ok(c.slots.some((s) => s.kind === "details"));
 assert.ok(c.slots.some((s) => s.kind === "assurance"));
});

test("the buy slot can't be hidden, however the config arrives", () => {
 const c = resolveProductPage({ slots: [{ id: "buy", kind: "buy", show: false }] });
 assert.equal(c.slots.find((s) => s.kind === "buy")?.show, true);
});

test("other slots can be hidden", () => {
 const c = resolveProductPage({ slots: [{ id: "price", kind: "price", show: false }] });
 assert.equal(c.slots.find((s) => s.kind === "price")?.show, false);
});

test("a store can slip its own note and link between the parts", () => {
 const c = resolveProductPage({
  slots: [
   { id: "title", kind: "title", show: true },
   { id: "n1", kind: "text", show: true, text: "This piece runs small." },
   { id: "n2", kind: "link", show: true, text: "Size guide", href: "/pages/sizing" },
   { id: "n3", kind: "divider", show: true },
   { id: "buy", kind: "buy", show: true },
  ],
 });
 assert.deepEqual(c.slots.map((s) => s.kind).slice(0, 5), ["title", "text", "link", "divider", "buy"]);
 assert.equal(c.slots[1].text, "This piece runs small.");
 assert.equal(c.slots[2].href, "/pages/sizing");
});

test("empty notes and unroutable links are dropped, not rendered", () => {
 const c = resolveProductPage({
  slots: [
   { id: "a", kind: "text", show: true, text: "   " },
   { id: "b", kind: "link", show: true, text: "Click", href: "javascript:alert(1)" },
   { id: "c", kind: "link", show: true, text: "Fine", href: "https://example.com" },
  ],
 });
 const custom = c.slots.filter((s) => !BUILTIN_SLOTS.includes(s.kind));
 assert.deepEqual(custom.map((s) => s.text), ["Fine"]);
});

test("a built-in named twice is kept once", () => {
 const c = resolveProductPage({
  slots: [{ id: "price", kind: "price", show: true }, { id: "price", kind: "price", show: false }],
 });
 assert.equal(c.slots.filter((s) => s.kind === "price").length, 1);
});

test("an unknown slot kind is dropped rather than thrown", () => {
 const c = resolveProductPage({ slots: [{ id: "x", kind: "iframe", show: true } as never] });
 assert.equal(c.slots.length, BUILTIN_SLOTS.length);
});

test("a seller's arrangement round-trips through a save unchanged", () => {
 const once = resolveProductPage({
  slots: [
   { id: "buy", kind: "buy", show: true },
   { id: "n1", kind: "text", show: true, text: "Ships in 2 days." },
   { id: "title", kind: "title", show: true },
  ],
 });
 const twice = resolveProductPage(once);
 assert.deepEqual(twice.slots.map((s) => s.kind), once.slots.map((s) => s.kind));
 assert.deepEqual(twice.slots.map((s) => s.id), once.slots.map((s) => s.id));
});
