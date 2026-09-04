import { test } from "node:test";
import assert from "node:assert/strict";
import { FLYERS, flyerBySlug, flyerSource, isFlyerSlug, flyerPaths } from "./flyers.ts";

test("every printed slug resolves to a flyer", () => {
 // If one of these ever stops resolving, a printed QR code becomes a dead link — and unlike a
 // broken button, we cannot fix the paper.
 for (const slug of ["vintage", "trendsetter", "not-shein", "fashion-clone", "emma-stolen-bag", "postcard"]) {
  assert.ok(flyerBySlug(slug), `${slug} must resolve`);
 }
});

test("an unknown slug resolves to nothing rather than a default", () => {
 // A typo'd address should 404, not silently serve the vintage flyer and pollute its numbers.
 assert.equal(flyerBySlug("vintge"), undefined);
 assert.equal(flyerBySlug(""), undefined);
});

test("slugs are matched case-insensitively and trimmed", () => {
 // QR scanners and hand-typed URLs both produce stray case and whitespace.
 assert.equal(flyerBySlug("Vintage")?.slug, "vintage");
 assert.equal(flyerBySlug(" not-shein ")?.slug, "not-shein");
});

test("the Fendi flyer carries BOTH its printed lines — the setup and the punchline", () => {
 const emma = flyerBySlug("emma-stolen-bag");
 assert.match(emma!.headline, /Fendi baguette/);
 assert.match(emma!.subhead, /I have proof/);
});

test("each flyer carries its own headline, so the paper's line continues on screen", () => {
 assert.equal(flyerBySlug("emma-stolen-bag")?.headline, "Emma, I know you stole my Fendi baguette.");
 assert.equal(flyerBySlug("not-shein")?.headline, "For the girls who don't shop at Shein.");
});

test("no two flyers share a headline or a slug", () => {
 assert.equal(new Set(FLYERS.map((f) => f.slug)).size, FLYERS.length);
 assert.equal(new Set(FLYERS.map((f) => f.headline)).size, FLYERS.length);
});

test("the attribution source is namespaced per flyer", () => {
 // pilot_access.source is shared with every other signup route, so "vintage" alone would collide
 // with anything else that ever calls itself that.
 assert.equal(flyerSource("vintage"), "flyer:vintage");
 assert.equal(flyerSource("postcard"), "flyer:postcard");
});

test("the source string fits the column", () => {
 // pilot_access.source is VARCHAR(50); a truncated source silently breaks attribution.
 for (const f of FLYERS) assert.ok(flyerSource(f.slug).length <= 50, `${f.slug} source too long`);
});

test("isFlyerSlug guards the route without throwing", () => {
 assert.equal(isFlyerSlug("vintage"), true);
 assert.equal(isFlyerSlug("login"), false);
});

test("flyerPaths lists every route that must be publicly reachable", () => {
 // These are what proxy.ts has to let through; a flyer missing here dead-ends at /login.
 assert.deepEqual(flyerPaths().sort(), FLYERS.map((f) => `/${f.slug}`).sort());
 assert.equal(flyerPaths().length, 6);
});
