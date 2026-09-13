import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { addedPagePath, buildBlankPage, canHidePath, countLinksTo, mergePageList, pageLabel, pickBlankTemplatePath, removalRefusal, type PageRow } from "./pages.ts";
import { detectMenus } from "./menus.ts";
import { DAWN_MENU_HOME, SQS_MENU_HOME } from "./fixtures.ts";

const PATHS = ["/", "/cart", "/collections/all", "/collections/classics", "/pages/about-us", "/pages/client-care", "/blogs/news", "/pages/sourcing-styling", "/products/velvet-coat"];
const row = (o: Partial<PageRow> & { path: string }): PageRow => ({ title: null, navLabel: null, hidden: false, kind: "captured", ...o });

test("the pages a shop cannot do without are never removable, and say why", () => {
 assert.match(removalRefusal("/")!, /home page/i);
 assert.match(removalRefusal("/cart")!, /check out|checkout/i);
 assert.match(removalRefusal("/search")!, /search/i);
 assert.match(removalRefusal("/products/velvet-coat")!, /every product page/i);
 assert.match(removalRefusal("/pages/x", { productTemplate: "/pages/x" })!, /every product page/i);
 assert.equal(removalRefusal("/pages/about-us"), null);
 assert.equal(canHidePath("/collections/classics"), true);
 // "/cart/" is the same page as "/cart".
 assert.ok(removalRefusal("/cart/"));
});

test("a page is called what she renamed it, and otherwise what its address says", () => {
 assert.equal(pageLabel("/pages/about-us"), "About Us");
 assert.equal(pageLabel("/"), "Home");
 assert.equal(pageLabel("/pages/about-us", row({ path: "/x", title: "Our Story" })), "Our Story");
 assert.equal(pageLabel("/pages/about-us", row({ path: "/x", title: "Our Story", navLabel: "About" })), "About");
});

test("the list opens with her menu, in menu order, and groups the rest", () => {
 const menu = detectMenus(cheerio.load(DAWN_MENU_HOME))!;
 const list = mergePageList({
  paths: PATHS, rows: new Map([["/pages/about-us", row({ path: "/pages/about-us", hidden: true, navLabel: "About" })]]),
  menu, unlinked: ["/pages/client-care"], productTemplate: "/products/velvet-coat",
 });
 assert.deepEqual(list.filter((e) => e.group === "menu").map((e) => e.path), ["/", "/pages/about-us", "/collections/all", "/pages/sourcing-styling", "/blogs/news"]);
 const about = list.find((e) => e.path === "/pages/about-us")!;
 assert.equal(about.hidden, true);
 assert.equal(about.label, "About");
 assert.equal(about.inMenu, true);
 // Her shop's own words win over the address: /collections/all is "Our Shoes", not "All".
 assert.equal(list.find((e) => e.path === "/collections/all")!.label, "Our Shoes");
 assert.equal(list.find((e) => e.path === "/blogs/news")!.label, "Shoe Blog");
 // …and a page her menu never mentions still falls back to its address.
 assert.equal(list.find((e) => e.path === "/collections/classics")!.label, "Classics");
 assert.equal(list.find((e) => e.path === "/collections/classics")!.group, "collections");
 assert.equal(list.find((e) => e.path === "/pages/client-care")!.group, "unlinked");
 assert.equal(list.find((e) => e.path === "/cart")!.canHide, false);
 assert.equal(list[list.length - 1].group, "product");
 // Hundreds of product pages are one design, never hundreds of rows.
 assert.equal(list.filter((e) => e.path.startsWith("/products/")).length, 1);
});

test("with no menu and no rows, the list is simply her captured pages", () => {
 const list = mergePageList({ paths: ["/", "/pages/a"], rows: new Map(), menu: null });
 assert.deepEqual(list.map((e) => e.path), ["/", "/pages/a"]);
 assert.ok(list.every((e) => !e.hidden && e.kind === "captured" && !e.inMenu));
});

test("how many links still point at a page she is about to hide", () => {
 assert.equal(countLinksTo([DAWN_MENU_HOME], "/pages/about-us"), 1, "one target, however many links reach it");
 assert.equal(countLinksTo([DAWN_MENU_HOME], "/pages/nothing-here"), 0);
});

test("a page she adds takes her platform's own address shape, and never an address already in use", () => {
 assert.equal(addedPagePath("Shipping & Returns", "shopify", PATHS), "/pages/shipping-returns");
 assert.equal(addedPagePath("Our Story", "squarespace", ["/our-story"]), "/our-story-2");
 assert.equal(addedPagePath("About Us", "shopify", PATHS), "/pages/about-us-2");
 assert.equal(addedPagePath("!!!", "shopify", []), "/pages/page");
});

test("the page her chrome is borrowed from is the simplest one she has, never the shop", () => {
 // Her shortest ordinary page — never the shop, a product, the cart, or the homepage.
 assert.equal(pickBlankTemplatePath(PATHS, "shopify"), "/pages/about-us");
 assert.equal(pickBlankTemplatePath(["/", "/cart", "/collections/all"], "shopify"), "/");
 assert.equal(pickBlankTemplatePath(["/", "/shop", "/contact", "/our-story"], "squarespace"), "/contact");
});

test("a new page keeps her header, footer and styles, and claims nothing of the page it came from", () => {
 const out = buildBlankPage(DAWN_MENU_HOME, { title: "Shipping" });
 const $ = cheerio.load(out);
 assert.equal($("header .list-menu--inline li").length, 5, "her menu, intact");
 assert.equal($("footer").length, 1);
 assert.match($("head").html() || "", /shared-theme/, "her stylesheet came with it");
 assert.equal($("title").text(), "Shipping");
 assert.equal($('meta[property="og:title"]').attr("content"), "Shipping");
 assert.equal($('link[rel="canonical"]').length, 0, "it is not a copy of the page it borrowed");
 // The borrowed page's own content is gone; one starter block stands in its place.
 assert.doesNotMatch($("main").text(), /Welcome/);
 assert.equal($("[data-vya-block]").length, 1);
 assert.match($("[data-vya-block]").text(), /Shipping/);
});

test("a Squarespace page is built the same way", () => {
 const $ = cheerio.load(buildBlankPage(SQS_MENU_HOME, { title: "Visit" }));
 assert.equal($("header#header").length, 1);
 assert.equal($("footer#footer-sections").length, 1);
 assert.equal($("title").text(), "Visit");
 assert.doesNotMatch($("main").text(), /Lei/);
 assert.equal($("[data-vya-block]").length, 1);
});

test("a template we could not read still produces a page, never a crash", () => {
 const $ = cheerio.load(buildBlankPage("", { title: "Empty" }));
 assert.equal($("title").text(), "Empty");
 assert.equal($("[data-vya-block]").length, 1);
});
