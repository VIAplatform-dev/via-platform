import { test } from "node:test";
import assert from "node:assert";
import { matchDestinations, DESTINATIONS } from "./destinations.ts";

const labels = (q: string) => matchDestinations(q).map((d) => d.label);

test("the words she actually typed find the screen", () => {
  // The report: typing "consignment" on Home answered "Nothing matches", with the Consignment
  // tile visible on the same screen.
  assert.ok(labels("consignment").includes("Consignment"));
  assert.ok(labels("crosslisting").includes("Cross-listing"));
  assert.ok(labels("cross-listing").includes("Cross-listing"));
  assert.ok(labels("cross listing").includes("Cross-listing"));
});

test("a prefix is enough", () => {
  assert.ok(labels("consign").includes("Consignment"));
  assert.ok(labels("inv").includes("Inventory"));
  assert.ok(labels("payout").includes("Payouts"));
  assert.ok(labels("market").includes("Market Mode"));
});

test("found by what it does, not what we named it", () => {
  assert.ok(labels("refunds").includes("Returns policy"));
  assert.ok(labels("returns").includes("Returns policy"));
  assert.ok(labels("stripe").includes("Payouts"));
  assert.ok(labels("url").includes("Your domain"));
  assert.ok(labels("bookings").includes("Appointments"));
  assert.ok(labels("promo").includes("Discounts"));
  assert.ok(labels("subscription").includes("Billing"));
  assert.ok(labels("in person").includes("Market Mode"));
  assert.ok(labels("postage").includes("Shipping"));
});

test("an exact name outranks a keyword mention", () => {
  // "Shipping" names a screen and is also a keyword on Orders. The screen wins.
  assert.equal(labels("shipping")[0], "Shipping");
  assert.equal(labels("consignors")[0], "Consignors");
});

test("one character matches nothing", () => {
  // Otherwise a single letter buries the piece she is looking for under a wall of screens.
  assert.deepEqual(matchDestinations("c"), []);
  assert.deepEqual(matchDestinations(" "), []);
  assert.deepEqual(matchDestinations(""), []);
});

test("nonsense matches nothing", () => {
  assert.deepEqual(matchDestinations("zzzqqq"), []);
});

test("the list is capped", () => {
  assert.ok(matchDestinations("s", 4).length <= 4);
  assert.ok(matchDestinations("co").length <= 4);
});

test("every destination has a seller route and no empty fields", () => {
  for (const d of DESTINATIONS) {
    assert.ok(d.label.trim(), "label");
    assert.ok(d.sub.trim(), `sub for ${d.label}`);
    assert.ok(
      d.href.startsWith("/(seller)/") || d.href === "/(seller)" || d.href === "/market",
      `${d.label} points at ${d.href}`,
    );
  }
});

test("every destination is reachable by its own name", () => {
  // A row nobody can find is a row that does not exist.
  for (const d of DESTINATIONS) {
    const found = matchDestinations(d.label, DESTINATIONS.length).some((x) => x.label === d.label);
    assert.ok(found, `${d.label} cannot find itself`);
  }
});
