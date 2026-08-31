import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeStore, findingKind, type ParityReport, type BlackoutReport } from "./store-health.ts";

// Shapes match what scripts/parity-check.mts and scripts/blackout-check.mts write.
const cleanParity: ParityReport = {
 catalog: { sourceProducts: 10, ourItems: 10, missingHere: 0, extraHere: 0, availabilityMismatch: 0, productParityPct: 100, collections: 4, collectionsExact: 4, collectionsMissingHere: [], collectionsOff: [] },
 pages: { sitemap: 20, captured: 20, missingHere: 0, pageParityPct: 100 },
 shopper: { "/collections/all": { titlesPresent: "12/12", titlesInOrder: "12/12", pricesPresent: "12/12", navPresent: "8/8", headingsPresent: "3/3" } },
};
const page = { imgsLoaded: 10, productLinks: 6, headerVisible: true, logoLoaded: true, videosPlaying: 0, bgImagesShopify: 0, text: 1000 };
const cleanBlackout: BlackoutReport = { pages: { "/": { normal: page, blackout: page } } };

test("a store with nothing wrong passes with no findings", () => {
 const g = gradeStore({ parity: cleanParity, blackout: cleanBlackout });
 assert.equal(g.verdict, "pass");
 assert.deepEqual(g.findings, []);
});

test("a missing product or a wrong price is blocking — the store cannot sell correctly", () => {
 const parity = structuredClone(cleanParity);
 parity.catalog.missingHere = 2;
 parity.shopper["/collections/all"].pricesPresent = "9/12";
 const g = gradeStore({ parity, blackout: cleanBlackout });
 assert.equal(g.verdict, "fail");
 const tiers = g.findings.map((f) => f.tier);
 assert.deepEqual(tiers, ["blocking", "blocking"]);
 assert.match(g.findings[0].message, /2 products/);
 assert.match(g.findings[1].message, /3 prices/);
});

test("prices missing only because those products are absent are not a price problem", () => {
 // A source page's "you may also like" strip shows products ours does not; their prices are then
 // "missing" too. That is one degrading finding (products not shown), never a blocking price one.
 const parity = structuredClone(cleanParity);
 parity.shopper["/collections/x"] = { titlesPresent: "1/4", titlesInOrder: "1/4", pricesPresent: "1/4", navPresent: "8/8", headingsPresent: "3/3" };
 const g = gradeStore({ parity, blackout: cleanBlackout });
 assert.equal(g.verdict, "warn");
 assert.ok(!g.findings.some((f) => f.tier === "blocking"));
 // Still a price problem when more prices are missing than products are.
 parity.shopper["/collections/x"].pricesPresent = "0/4";
 const g2 = gradeStore({ parity, blackout: cleanBlackout });
 assert.equal(g2.verdict, "fail");
 assert.match(g2.findings[0].message, /1 price/);
});

test("a page where no products were compared cannot have a price finding, and misses are quoted", () => {
 const parity = structuredClone(cleanParity);
 parity.shopper["/collections/prada"] = { titlesPresent: "0/0", titlesInOrder: "0/0", pricesPresent: "0/14", navPresent: "2/2", headingsPresent: "1/1" };
 const g = gradeStore({ parity, blackout: cleanBlackout });
 assert.ok(!g.findings.some((f) => f.tier === "blocking"));
 assert.match(g.findings[0].message, /couldn’t compare/);
 parity.shopper["/collections/prada"] = { titlesPresent: "14/14", titlesInOrder: "14/14", pricesPresent: "12/14", navPresent: "2/2", headingsPresent: "1/1", missingPrices: ["£290", "£1150"] };
 const g2 = gradeStore({ parity, blackout: cleanBlackout });
 assert.match(g2.findings[0].message, /2 prices differ from your site \(£290, £1150\)/);
});

test("losing images or a collection count under blackout is degrading, not blocking", () => {
 const parity = structuredClone(cleanParity);
 parity.catalog.collectionsExact = 3;
 parity.catalog.collectionsOff = ["dresses 31/21"];
 const blackout: BlackoutReport = { pages: { "/": { normal: page, blackout: { ...page, imgsLoaded: 4, videosPlaying: 0 } } } };
 const g = gradeStore({ parity, blackout });
 assert.equal(g.verdict, "warn");
 assert.ok(g.findings.every((f) => f.tier === "degrading"));
 const photos = g.findings.find((f) => f.message.includes("photos"))!;
 assert.match(photos.message, /6 photos/);
 assert.equal(photos.page, "/");
});

test("losing product links or the header under blackout is blocking — shoppers cannot reach items", () => {
 const blackout: BlackoutReport = { pages: { "/collections/all": { normal: page, blackout: { ...page, productLinks: 0, headerVisible: false } } } };
 const g = gradeStore({ parity: cleanParity, blackout });
 assert.equal(g.verdict, "fail");
 assert.equal(g.findings.filter((f) => f.tier === "blocking").length, 2);
});

test("order and nav differences are cosmetic and never change the verdict", () => {
 const parity = structuredClone(cleanParity);
 parity.shopper["/collections/all"].titlesInOrder = "3/12";
 parity.shopper["/collections/all"].navPresent = "7/8";
 const g = gradeStore({ parity, blackout: cleanBlackout });
 assert.equal(g.verdict, "pass");
 assert.deepEqual(g.findings.map((f) => f.tier), ["cosmetic", "cosmetic"]);
});

test("a page that failed to render at all is blocking, and a missing report is reported not crashed", () => {
 const blackout: BlackoutReport = { pages: { "/": { normal: page, blackout: { error: "timeout" } } } };
 assert.equal(gradeStore({ parity: cleanParity, blackout }).verdict, "fail");
 const g = gradeStore({ parity: null, blackout: null });
 assert.equal(g.verdict, "unknown");
 assert.equal(g.findings.length, 1);
});

test("messages are written for a seller, never in engineering terms", () => {
 const blackout: BlackoutReport = { pages: { "/": { normal: { ...page, videosPlaying: 1 }, blackout: { ...page, videosPlaying: 0 } } } };
 const g = gradeStore({ parity: cleanParity, blackout });
 for (const f of g.findings) assert.doesNotMatch(f.message, /shopify|blackout|cdn|parity|srcset/i);
 assert.match(g.findings[0].message, /video/);
});

test("findingKind collapses counts, pages and examples so the same problem groups across stores", () => {
 assert.equal(findingKind({ tier: "blocking", page: "/collections/prada", message: "14 prices differ from your site (£290, £1150)." }),
  findingKind({ tier: "blocking", page: "/collections/bags", message: "1 price differs from your site." }));
 assert.equal(findingKind({ tier: "degrading", message: "12 collections have a different number of products than on your site (bags 2/1)." }),
  "degrading · N collections have a different number of products than on your site.");
 assert.notEqual(findingKind({ tier: "degrading", page: "/products/x", message: "8 photos would stop loading if you left your current platform." }),
  findingKind({ tier: "degrading", page: "/", message: "8 photos would stop loading if you left your current platform." }));
});

test("on a product page, products absent here are the store's recommendation picks — cosmetic, and said so", () => {
 const parity = structuredClone(cleanParity);
 parity.shopper["/products/x"] = { titlesPresent: "0/4", titlesInOrder: "0/1", pricesPresent: "1/5", navPresent: "8/8", headingsPresent: "3/3" };
 const g = gradeStore({ parity, blackout: cleanBlackout });
 assert.equal(g.verdict, "pass");
 assert.equal(g.findings.length, 1);
 assert.equal(g.findings[0].tier, "cosmetic");
 assert.match(g.findings[0].message, /you may also like/i);
});

test("a rail serving pieces the seller never filed in it is blocking — the page contradicts itself", () => {
 // Not a difference with their site: a difference with our OWN records. A shopper on that page is
 // being shown stock the seller did not put there, which is worse than a page that is merely stale.
 const parity = structuredClone(cleanParity);
 parity.catalog.collectionsInflated = ["dresses 401/94", "chanel 243/60"];
 const g = gradeStore({ parity, blackout: cleanBlackout });
 assert.equal(g.verdict, "fail");
 const f = g.findings.find((x) => /didn’t put|did not put/.test(x.message));
 assert.ok(f, `expected a finding about unfiled pieces, got: ${g.findings.map((x) => x.message).join(" | ")}`);
 assert.equal(f.tier, "blocking");
 assert.match(f.message, /2 collections/);
 assert.match(f.message, /dresses/, "names the rail so the seller can go and look");
});

test("no inflated rails means no such finding", () => {
 const parity = structuredClone(cleanParity);
 parity.catalog.collectionsInflated = [];
 const g = gradeStore({ parity, blackout: cleanBlackout });
 assert.deepEqual(g.findings, []);
});

test("a product page advertising a price the cart won't honour is blocking", () => {
 // The worst thing a hosted store can do: show one number and charge another.
 const parity = structuredClone(cleanParity);
 parity.catalog.priceChecked = 12;
 parity.catalog.priceStale = ["valentino-dress", "miu-miu-bikini"];
 const g = gradeStore({ parity, blackout: cleanBlackout });
 assert.equal(g.verdict, "fail");
 const f = g.findings.find((x) => /price/i.test(x.message));
 assert.ok(f, `expected a price finding, got: ${g.findings.map((x) => x.message).join(" | ")}`);
 assert.equal(f.tier, "blocking");
 assert.match(f.message, /2 product pages/);
 // Seller words: no jargon about captures, stamps or records.
 assert.doesNotMatch(f.message, /captur|stamp|record|parity/i);
});

test("pages we could not price at all are reported, not passed over in silence", () => {
 const parity = structuredClone(cleanParity);
 parity.catalog.priceChecked = 10;
 parity.catalog.priceStale = [];
 parity.catalog.priceUnstated = 3;
 const g = gradeStore({ parity, blackout: cleanBlackout });
 const f = g.findings.find((x) => /couldn’t check|couldn't check/i.test(x.message));
 assert.ok(f, `expected an unchecked-pages finding, got: ${g.findings.map((x) => x.message).join(" | ")}`);
 assert.equal(f.tier, "degrading");
});

test("prices that all match produce no finding", () => {
 const parity = structuredClone(cleanParity);
 parity.catalog.priceChecked = 12;
 parity.catalog.priceStale = [];
 parity.catalog.priceUnstated = 0;
 const g = gradeStore({ parity, blackout: cleanBlackout });
 assert.deepEqual(g.findings, []);
});

test("a page that loses SOME products under blackout is degrading, not blocking", () => {
 // thenicheshop: a filter app injects extra tiles, so the page renders 40 normally and 35 with the
 // platform cut off — and 14 of them differ, so it is a different selection rather than a shrunken
 // one. Every piece that drops out is active and sits in four to six other collections, so nothing
 // becomes unreachable. Calling that "product links would stop working" is not true.
 // normal and blackout must be SEPARATE objects — the clean fixture shares one.
 const blackout = { pages: { "/": { normal: { ...page, productLinks: 40 }, blackout: { ...page, productLinks: 35 } } } };
 const g = gradeStore({ parity: cleanParity, blackout });
 const f = g.findings.find((x) => /product/i.test(x.message));
 assert.ok(f, `expected a finding, got ${JSON.stringify(g.findings)}`);
 assert.equal(f.tier, "degrading");
 assert.match(f.message, /fewer/i);
 assert.equal(g.verdict, "warn");
});

test("a page that loses EVERY product under blackout is still blocking", () => {
 // The real failure this rule exists for: nothing on the page is reachable any more.
 const blackout = { pages: { "/": { normal: { ...page, productLinks: 40 }, blackout: { ...page, productLinks: 0 } } } };
 const g = gradeStore({ parity: cleanParity, blackout });
 assert.equal(g.verdict, "fail");
 const f = g.findings.find((x) => /product/i.test(x.message));
 assert.equal(f.tier, "blocking");
 assert.match(f.message, /no products|none of|nothing/i);
});

test("a store whose catalogue we could not check never reads as passing", () => {
 // lei-vintage and montrose-edit are Squarespace; thevintageboutiquestyle.com is on something we do
 // not recognise at all. The catalogue, price, collection and sold-status checks all run only for
 // Shopify, and simply produced nothing for these three — so vintage-boutique-style came back as the
 // fleet's ONLY pass, by not being examined. Silence is not a clean bill of health.
 const parity = structuredClone(cleanParity);
 parity.catalog = { platform: "other" } as never;
 const g = gradeStore({ parity, blackout: cleanBlackout });
 const f = g.findings.find((x) => /couldn’t check|couldn't check/i.test(x.message));
 assert.ok(f, `expected an unchecked finding, got ${JSON.stringify(g.findings)}`);
 assert.equal(f.tier, "degrading");
 assert.equal(g.verdict, "warn", "unknown is not pass");
});

test("a store we did check is not accused of being uncheckable", () => {
 const g = gradeStore({ parity: cleanParity, blackout: cleanBlackout });
 assert.equal(g.verdict, "pass");
 assert.deepEqual(g.findings, []);
});

test("a piece she has no photo of is her problem to fix, not a store failure", () => {
 // feathers-boutique-vintage's seven are in stock and priced, with no image on her own site.
 // Nobody can render a card without one. Saying so is more use to her than calling it a product
 // we dropped — and it must not fail her store.
 const parity = structuredClone(cleanParity) as never as { catalog: Record<string, unknown> };
 parity.catalog.missingNoPhoto = 7;
 const f = gradeStore({ parity: parity as never, blackout: cleanBlackout }).findings;
 const hit = f.find((x) => /photo/i.test(x.message) && /add|no photo|without a photo/i.test(x.message));
 assert.ok(hit, `expected a no-photo finding, got: ${f.map((x) => x.message).join(" | ")}`);
 assert.notEqual(hit!.tier, "blocking");
});

test("sold and unlisted pieces are never counted as missing", () => {
 // Every "missing product" on bag-crush was one of these. Six stores failed over them.
 const parity = structuredClone(cleanParity) as never as { catalog: Record<string, unknown> };
 parity.catalog.soldOrUnlisted = 33;
 const f = gradeStore({ parity: parity as never, blackout: cleanBlackout }).findings;
 assert.equal(f.filter((x) => x.tier === "blocking").length, 0);
});
