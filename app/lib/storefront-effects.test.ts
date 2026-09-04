import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEffects, hasEffects, DEFAULT_EFFECTS } from "./storefront-effects.ts";

test("a store that has never touched it gets nothing drawn", () => {
 assert.deepEqual(resolveEffects(null), DEFAULT_EFFECTS);
 assert.equal(hasEffects(resolveEffects(null)), false);
});

test("a real effect is kept", () => {
 const e = resolveEffects({ cursor: "glitter", cursorColor: "#FF66CC" });
 assert.equal(e.cursor, "glitter");
 assert.equal(e.cursorColor, "#FF66CC");
 assert.equal(hasEffects(e), true);
});

test("an effect we don't ship falls back to none rather than throwing", () => {
 assert.equal(resolveEffects({ cursor: "fireworks" as never }).cursor, "none");
});

test("a colour that isn't a hex is dropped — it ends up in a stylesheet", () => {
 assert.equal(resolveEffects({ cursor: "glitter", cursorColor: "red; }" as never }).cursorColor, null);
 assert.equal(resolveEffects({ cursor: "glitter", cursorColor: "#fff" }).cursorColor, null);
});

test("the colour falls back to the accent by being absent, not by guessing here", () => {
 assert.equal(resolveEffects({ cursor: "sparkle" }).cursorColor, null);
});
