import test from "node:test";
import assert from "node:assert/strict";
import { redactOnPrivateScreens } from "./analytics-redact.ts";

// The privacy guarantee, and the thing that breaks everything if it throws: PostHog runs this on
// EVERY event, so an exception here doesn't lose one property — it silently stops all analytics.

test("leaves ordinary workspace screens alone", () => {
 const props = { $pathname: "/admin/cross-listing/settings", $el_text: "Connect a marketplace" };
 assert.equal(redactOnPrivateScreens({ ...props }).$el_text, "Connect a marketplace");
});

test("redacts the text of what was clicked on a seller's private screens", () => {
 for (const path of ["/admin/orders", "/admin/customers/buyers", "/admin/inbox", "/admin/payments", "/admin/consignment/payouts", "/admin/customers/recovery"]) {
  const out = redactOnPrivateScreens({ $pathname: path, $el_text: "Priya Raman — priya@example.com" });
  assert.equal(out.$el_text, "[redacted]", path);
 }
});

test("redacts inside the elements chain without destroying its structure", () => {
 const chain = 'a:text="Priya Raman"nth-child="2";div:text="$412.00"nth-child="1"';
 const out = redactOnPrivateScreens({ $pathname: "/admin/orders", $elements_chain: chain });
 const got = out.$elements_chain as string;
 assert.ok(!got.includes("Priya"), "name survived");
 assert.ok(!got.includes("412.00"), "amount survived");
 assert.ok(got.includes('nth-child="2"'), "structure was destroyed");
});

test("redacts the attributes that carry a person too, not just the text", () => {
 const out = redactOnPrivateScreens({
  $pathname: "/admin/orders",
  $elements: [{ tag_name: "a", $el_text: "Priya Raman", attr__href: "/admin/orders/ord_123?email=priya@example.com", attr__title: "Priya Raman", attr__class: "row" }],
 });
 const el = (out.$elements as Record<string, unknown>[])[0];
 assert.equal(el.$el_text, "[redacted]");
 assert.equal(el.attr__href, "[redacted]");
 assert.equal(el.attr__title, "[redacted]");
 assert.equal(el.attr__class, "row", "harmless attributes should survive");
 assert.equal(el.tag_name, "a", "the tag is what makes the event readable");
});

test("never throws, whatever PostHog hands it", () => {
 // If this throws, EVERY event stops — not just the ones on private screens.
 const nasty: Record<string, unknown>[] = [
  {},
  { $pathname: "/admin/orders" },
  { $pathname: "/admin/orders", $elements: null },
  { $pathname: "/admin/orders", $elements: [null, undefined, "str", 42] },
  { $pathname: "/admin/orders", $elements_chain: null },
  { $pathname: 123 },
  { $pathname: "/admin/orders", $el_text: null },
 ];
 for (const p of nasty) assert.doesNotThrow(() => redactOnPrivateScreens(p), JSON.stringify(p));
});
