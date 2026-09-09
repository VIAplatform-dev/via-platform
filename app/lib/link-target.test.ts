import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLinkTarget } from "./link-target.ts";

const PAGES = ["/", "/collections/children", "/collections/clothing", "/collections/all", "/pages/appointment", "/products/silk-slip-dress"];
const OPTS = { slug: "via-admin", origin: "https://tesselizabethvintage.com" };

test("a plain internal path finds its page", () => {
 const t = resolveLinkTarget("/collections/children", "Children", PAGES, OPTS);
 assert.deepEqual(t, { kind: "page", path: "/collections/children", label: "Children", matched: "url" });
});

test("a trailing slash is not a different page", () => {
 const t = resolveLinkTarget("/collections/children/", "Children", PAGES, OPTS);
 assert.equal(t.kind === "page" && t.path, "/collections/children");
});

test("a query string is not part of the address", () => {
 // The click that started this: /products/…?variant=42581570748512 sent the editor to a 404.
 const t = resolveLinkTarget("/products/silk-slip-dress?variant=42581570748512", "$96.00", PAGES, OPTS);
 assert.equal(t.kind === "page" && t.path, "/products/silk-slip-dress");
});

test("the editor's own /site/{slug} mount is stripped", () => {
 const t = resolveLinkTarget("/site/via-admin/collections/clothing", "Clothing", PAGES, OPTS);
 assert.equal(t.kind === "page" && t.path, "/collections/clothing");
});

test("the mount on its own is the home page", () => {
 const t = resolveLinkTarget("/site/via-admin", "Home", PAGES, OPTS);
 assert.equal(t.kind === "page" && t.path, "/");
});

test("her own domain spelled out in full is still her own page", () => {
 const t = resolveLinkTarget("https://tesselizabethvintage.com/collections/all", "Shop all", PAGES, OPTS);
 assert.equal(t.kind === "page" && t.path, "/collections/all");
});

test("somebody else's domain is external", () => {
 const t = resolveLinkTarget("https://instagram.com/tesselizabeth", "Instagram", PAGES, OPTS);
 assert.deepEqual(t, { kind: "external", href: "https://instagram.com/tesselizabeth", host: "instagram.com" });
});

test("mailto is external, and says who it writes to", () => {
 const t = resolveLinkTarget("mailto:hi@tess.com", "Email us", PAGES, OPTS);
 assert.equal(t.kind === "external" && t.host, "hi@tess.com");
});

test("a dead # falls back to the words, which is how the nav's dropdown parents work", () => {
 // Her CLOTHING nav item has href="#" — the page exists, the anchor never carried its address.
 const t = resolveLinkTarget("#", "Clothing", PAGES, OPTS);
 assert.deepEqual(t, { kind: "page", path: "/collections/clothing", label: "Clothing", matched: "name" });
});

test("the name fallback matches the seller's word for the home page", () => {
 assert.equal(resolveLinkTarget("#", "Home page", PAGES, OPTS).kind, "page");
});

test("a dead # whose words name nothing stays nothing", () => {
 assert.deepEqual(resolveLinkTarget("#", "Menu", PAGES, OPTS), { kind: "none" });
});

test("an internal path we never captured is missing, not guessed at", () => {
 // Guessing from the label here would jump her to an unrelated page.
 const t = resolveLinkTarget("/collections/clothing-archive", "Clothing", PAGES, OPTS);
 assert.deepEqual(t, { kind: "missing", path: "/collections/clothing-archive" });
});

test("an in-page anchor still offers the page its words name", () => {
 assert.equal(resolveLinkTarget("#main", "Children", PAGES, OPTS).kind, "page");
});

test("one-character labels are too thin to match on", () => {
 assert.deepEqual(resolveLinkTarget("#", "→", PAGES, OPTS), { kind: "none" });
});

test("case and spacing in the visible words don't matter", () => {
 assert.equal(resolveLinkTarget("#", "  CLOTHING ", PAGES, OPTS).kind, "page");
});

test("javascript: voids go nowhere", () => {
 assert.deepEqual(resolveLinkTarget("javascript:void(0)", "Menu", PAGES, OPTS), { kind: "none" });
});

test("with no captured origin, an absolute URL is treated as somebody else's", () => {
 const t = resolveLinkTarget("https://tesselizabethvintage.com/collections/all", "Shop all", PAGES, { slug: "via-admin" });
 assert.equal(t.kind, "external");
});
