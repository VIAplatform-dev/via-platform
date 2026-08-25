import { test } from "node:test";
import assert from "node:assert/strict";
import { attributeCostsTo, currentCostContext } from "./cost-context.ts";

// The point of this file is that a store set at the request boundary is still readable four layers
// down, where the money is actually spent. If that breaks, costs go back to being unattributable
// and nothing anywhere errors — the columns just quietly fill with nulls again, as they did for the
// whole life of the table.

test("outside a request there is no store, and that is correct", () => {
 assert.deepEqual(currentCostContext(), {});
});

test("a store set at the boundary is visible to code called later", async () => {
 await new Promise<void>((resolve) => {
  attributeCostsTo({ storeSlug: "honeybear-archive" });
  // Stand-ins for serp() / the valuation call: several awaits deep, no idea who called them.
  const deep = async () => { await Promise.resolve(); return currentCostContext(); };
  const deeper = async () => { await Promise.resolve(); return deep(); };
  deeper().then((ctx) => {
   assert.equal(ctx.storeSlug, "honeybear-archive");
   resolve();
  });
 });
});

test("one request's store never leaks into another's", async () => {
 const seen: (string | null | undefined)[] = [];
 const handle = async (slug: string) => {
  attributeCostsTo({ storeSlug: slug });
  await new Promise((r) => setTimeout(r, 1));
  seen.push(currentCostContext().storeSlug);
 };
 // Two concurrent requests, interleaved awaits — the classic way a global would cross-contaminate.
 await Promise.all([handle("store-a"), handle("store-b")]);
 assert.deepEqual(seen.sort(), ["store-a", "store-b"]);
});

test("an item id rides along when there is one", () => {
 attributeCostsTo({ storeSlug: "s", itemId: "item-42" });
 assert.equal(currentCostContext().itemId, "item-42");
});
