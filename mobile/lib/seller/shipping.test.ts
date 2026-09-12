import { test } from "node:test";
import assert from "node:assert/strict";
import { zonesWith, shipsAbroad, ZONE_IDS } from "./shipping.ts";

test("turning a zone on leaves every other zone alone", () => {
  const before = { domestic: { enabled: true }, europe: { enabled: false } };
  assert.deepEqual(zonesWith(before, "europe", true), {
    domestic: { enabled: true },
    europe: { enabled: true },
  });
});

test("a zone's per-tier prices survive being switched off and on", () => {
  // She set these on the web. Rebuilding the zone would drop them silently.
  const before = { europe: { enabled: true, rates: { large: 2200 } } };
  const off = zonesWith(before, "europe", false);
  assert.deepEqual(off.europe, { enabled: false, rates: { large: 2200 } });
  assert.deepEqual(zonesWith(off, "europe", true).europe, { enabled: true, rates: { large: 2200 } });
});

test("a zone that was never configured can still be switched on", () => {
  assert.deepEqual(zonesWith(undefined, "rest_of_world", true), { rest_of_world: { enabled: true } });
  assert.deepEqual(zonesWith({}, "north_america", true), { north_america: { enabled: true } });
});

test("shipping abroad ignores the domestic zone", () => {
  assert.equal(shipsAbroad({ domestic: { enabled: true } }), false);
  assert.equal(shipsAbroad({ domestic: { enabled: true }, europe: { enabled: true } }), true);
  assert.equal(shipsAbroad(null), false);
});

test("the four zones are the server's four", () => {
  assert.deepEqual(ZONE_IDS, ["domestic", "europe", "north_america", "rest_of_world"]);
});
