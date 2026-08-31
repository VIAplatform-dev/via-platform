import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReadiness } from "./readiness-core.ts";

const item = (o: Partial<{ id: string; status: string; priceCents: number; images: string[]; variants: unknown[] }>) => ({
 id: "x", status: "active", priceCents: 1000, images: ["a.jpg"], variants: [], ...o,
});

test("counts the problems that would slow a market sale", () => {
 const r = computeReadiness({
 chargesEnabled: true,
 items: [
 item({ id: "1" }),
 item({ id: "2", images: [] }),
 item({ id: "3", priceCents: 0 }),
 item({ id: "4", variants: [{ size: "S", available: true }, { size: "M", available: true }] }),
 item({ id: "5", status: "sold", images: [], priceCents: 0 }),
 ],
 legacyProductCount: 12,
 });
 assert.equal(r.available, 4);
 assert.equal(r.missingPhotos, 1);
 assert.equal(r.missingPrice, 1);
 assert.equal(r.multiVariant, 1);
 assert.equal(r.legacyProducts, 12);
 assert.equal(r.paymentsReady, true);
 assert.equal(r.ready, false); // legacy catalog not converted + missing price
});

test("ready when payments work and every available item has a photo and a price", () => {
 const r = computeReadiness({ chargesEnabled: true, items: [item({}), item({ id: "2" })], legacyProductCount: 0 });
 assert.equal(r.ready, true);
});

test("cash-only is not blocking: payments off still lets the market run", () => {
 const r = computeReadiness({ chargesEnabled: false, items: [item({})], legacyProductCount: 0 });
 assert.equal(r.paymentsReady, false);
 assert.equal(r.ready, true);
 assert.ok(r.warnings.some((w) => /cash/i.test(w)));
});
