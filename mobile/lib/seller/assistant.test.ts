import { test } from "node:test";
import assert from "node:assert/strict";
import { actionChips, changedTheStore, isYesNoQuestion, parseRich, spans, toApiMessages, toImageBlock } from "./assistant.ts";

// The web's Sidekick and this screen are one surface in two packages. These tests pin the parts
// that are shared logic rather than layout, so the phone falling behind the web shows up here.

/* ── chips ─────────────────────────────────────────────────────────────── */

test("only successful, nameable tools become chips", () => {
  assert.deepEqual(
    actionChips([
      { name: "add_section", ok: true },
      { name: "set_layout", ok: false },      // it failed; saying "Rebuilt page" would be a lie
      { name: "get_storefront", ok: true },   // read-only, no label, no chip
      { name: "update_listing", ok: true },
    ]),
    ["Added section", "Updated listing"],
  );
  assert.deepEqual(actionChips(), []);
});

test("a write she can see elsewhere invalidates the cache; a read does not", () => {
  assert.equal(changedTheStore([{ name: "update_listing", ok: true }]), true);
  assert.equal(changedTheStore([{ name: "write_storefront_code", ok: true }]), true);
  assert.equal(changedTheStore([{ name: "update_listing", ok: false }]), false);
  assert.equal(changedTheStore([{ name: "list_sections", ok: true }, { name: "remember_fact", ok: true }]), false);
  assert.equal(changedTheStore(), false);
});

/* ── yes/no ────────────────────────────────────────────────────────────── */

test("a confirmation gets buttons, wherever the question sits in the reply", () => {
  assert.equal(isYesNoQuestion("I can make the hero taller.\n\nShall I go ahead?"), true);
  assert.equal(isYesNoQuestion("Want me to add a reviews section? Just say the word."), true);
  assert.equal(isYesNoQuestion("**Should I** use the burgundy?"), true);
});

test("an open question never gets them", () => {
  assert.equal(isYesNoQuestion("What should the heading say?"), false);
  assert.equal(isYesNoQuestion("Would you like a grid or a carousel?"), false);
  assert.equal(isYesNoQuestion("Shall I go ahead?\n\n- Grid\n- Rail"), false);
  assert.equal(isYesNoQuestion("Done. Your storefront is live."), false);
  // A long essay ending in a question mark is not a confirmation prompt.
  assert.equal(isYesNoQuestion(`Should ${"x".repeat(220)}?`), false);
});

/* ── markdown ──────────────────────────────────────────────────────────── */

test("inline markdown becomes styled runs, and plain text survives untouched", () => {
  assert.deepEqual(spans("Set **Newsreader** as the `heading` face"), [
    { text: "Set " }, { text: "Newsreader", bold: true }, { text: " as the " }, { text: "heading", code: true }, { text: " face" },
  ]);
  assert.deepEqual(spans("See [your shop](https://vyaplatform.com/s/x)"), [
    { text: "See " }, { text: "your shop", href: "https://vyaplatform.com/s/x" },
  ]);
  assert.deepEqual(spans("no markup here"), [{ text: "no markup here" }]);
});

test("a reply becomes paragraphs, lists and code, in order", () => {
  const blocks = parseRich("Here's the plan:\n\n1. Add a hero\n2. Write copy\n\nThen:\n- ship it\n\n```ts\nconst a = 1;\n```");
  assert.deepEqual(blocks.map((b) => b.kind), ["para", "list", "para", "list", "code"]);
  const ordered = blocks[1];
  assert.equal(ordered.kind === "list" && ordered.ordered, true);
  assert.deepEqual(ordered.kind === "list" ? ordered.items.map((i) => i[0].text) : [], ["Add a hero", "Write copy"]);
  const bullets = blocks[3];
  assert.equal(bullets.kind === "list" && bullets.ordered, false);
  assert.equal(blocks[4].kind === "code" ? blocks[4].text : "", "const a = 1;");
});

test("a bullet list directly after a numbered one is a second list, not more items", () => {
  const blocks = parseRich("1. first\n- second");
  assert.deepEqual(blocks.map((b) => (b.kind === "list" ? b.ordered : b.kind)), [true, false]);
});

test("a reply that is only prose is one paragraph, newlines and all", () => {
  const blocks = parseRich("Line one\nline two");
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].kind === "para" ? blocks[0].spans : [], [{ text: "Line one\nline two" }]);
});

/* ── the request body ──────────────────────────────────────────────────── */

test("text turns stay strings; a photographed turn leads with the image", () => {
  const out = toApiMessages([
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi" },
    { role: "user", content: "like this?", images: ["data:image/jpeg;base64,AAAA"] },
  ]);
  assert.equal(out[0].content, "hello");
  assert.deepEqual(out[2].content, [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } },
    { type: "text", text: "like this?" },
  ]);
});

test("photos sent with no words carry no empty text block", () => {
  const [only] = toApiMessages([{ role: "user", content: "", images: ["data:image/png;base64,BBBB"] }]);
  assert.deepEqual(only.content, [{ type: "image", source: { type: "base64", media_type: "image/png", data: "BBBB" } }]);
});

test("the media type is read off the data URL, not assumed", () => {
  assert.equal(toImageBlock("data:image/heic;base64,CCCC").source.media_type, "image/heic");
  // A malformed URL still sends something rather than throwing mid-send.
  assert.equal(toImageBlock("data:;base64,DDDD").source.media_type, "image/jpeg");
});
