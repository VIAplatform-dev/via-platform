import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { applyMenu, detectMenus, menuLists, normalizeMenuHref, sanitizeMenuItems, type StoredMenu } from "./menus.ts";
import { DAWN_MENU_HOME, DAWN_LANDING, SQS_MENU_HOME } from "./fixtures.ts";

const load = (html: string) => cheerio.load(html);
/** The labels of every menu copy on the page, as a shopper would read them top to bottom. */
const copies = ($: cheerio.CheerioAPI) => menuLists($).map((l) => l.items.map((i) => i.label));

test("a href is reduced to the page it names, whatever shape the capture stored it in", () => {
 assert.equal(normalizeMenuHref("/collections/all/"), "/collections/all");
 assert.equal(normalizeMenuHref("/site/lei-vintage/our-story"), "/our-story");
 assert.equal(normalizeMenuHref("/pages/about-us?x=1#top"), "/pages/about-us");
 assert.equal(normalizeMenuHref("/"), "/");
 assert.equal(normalizeMenuHref("/site/lei-vintage"), "/");
 // Not pages of hers: somewhere else entirely, and a link that goes nowhere.
 assert.equal(normalizeMenuHref("https://instagram.com/x"), "https://instagram.com/x");
 assert.equal(normalizeMenuHref("#"), null);
 assert.equal(normalizeMenuHref("javascript:alert(1)"), null);
});

test("the two copies of a Dawn menu are read as ONE menu, and the lists beside it are not menus", () => {
 const menu = detectMenus(load(DAWN_MENU_HOME))!;
 assert.ok(menu);
 assert.equal(menu.copies, 2, "the drawer and the inline list");
 assert.deepEqual(menu.items.map((i) => i.label), ["Home", "About Us", "Our Shoes", "Sourcing & Styling", "Shoe Blog"]);
 assert.deepEqual(menu.items.map((i) => i.href), ["/", "/pages/about-us", "/collections/all", "/pages/sourcing-styling", "/blogs/news"]);
 // The country picker (every href "#") and the social row (all external) are not navigation.
 const found = menuLists(load(DAWN_MENU_HOME)).map((l) => l.items.map((i) => i.label));
 assert.equal(found.length, 2);
 assert.ok(!found.flat().includes("Australia"));
 assert.ok(!found.flat().includes("Instagram"));
});

test("Squarespace: two navs, one menu, with the VYA path normalised away", () => {
 const menu = detectMenus(load(SQS_MENU_HOME))!;
 assert.equal(menu.copies, 2);
 assert.deepEqual(menu.items.map((i) => i.href), ["/shop", "/our-story", "/contact"]);
});

test("her order reaches BOTH copies — the desktop menu and the one the phone opens", () => {
 const $ = load(DAWN_MENU_HOME);
 const menu = detectMenus($)!;
 const reordered: StoredMenu = { signature: menu.signature, items: [menu.items[1], ...menu.items.filter((_, i) => i !== 1)] };
 const r = applyMenu($, { menu: reordered });
 assert.equal(r.copies, 2);
 assert.equal(r.changed, true);
 for (const labels of copies($)) assert.deepEqual(labels, ["About Us", "Home", "Our Shoes", "Sourcing & Styling", "Shoe Blog"], "About Us first, in every copy");
});

test("a hidden page's menu links disappear — from both copies, with no stored menu at all", () => {
 const $ = load(DAWN_MENU_HOME);
 const r = applyMenu($, { menu: null, hidden: new Set(["/pages/about-us"]) });
 assert.equal(r.changed, true);
 for (const labels of copies($)) assert.ok(!labels.includes("About Us"), labels.join(","));
 // Only the menu link goes: the page's own content and the footer link are not the menu's business.
 assert.equal($('main a[href="/pages/about-us"]').length, 1);
});

test("hiding also wins over a stored order that still names the page", () => {
 const $ = load(DAWN_MENU_HOME);
 const menu = detectMenus($)!;
 applyMenu($, { menu, hidden: new Set(["/blogs/news"]) });
 for (const labels of copies($)) assert.deepEqual(labels, ["Home", "About Us", "Our Shoes", "Sourcing & Styling"]);
});

test("a page with its own header is left alone — a menu is only applied where it was learned", () => {
 const $ = load(DAWN_LANDING);
 const menu = detectMenus(load(DAWN_MENU_HOME))!;
 const before = $.html();
 const r = applyMenu($, { menu: { signature: menu.signature, items: [...menu.items].reverse() } });
 assert.equal(r.copies, 0);
 assert.equal($.html(), before);
});

test("an item she added is cloned from one of her own, with the active markers cleared", () => {
 const $ = load(DAWN_MENU_HOME);
 const menu = detectMenus($)!;
 const withNew: StoredMenu = { signature: menu.signature, items: [...menu.items, { id: "new", label: "Shipping", href: "/pages/shipping" }] };
 applyMenu($, { menu: withNew });
 for (const labels of copies($)) assert.deepEqual(labels[labels.length - 1], "Shipping");
 const added = $('a[href="/pages/shipping"]');
 assert.equal(added.length, 2, "added to both copies");
 added.each((_i, el) => {
  assert.equal($(el).attr("aria-current"), undefined);
  assert.ok(!/--active/.test($(el).attr("class") || ""), $(el).attr("class"));
  assert.match($(el).attr("class") || "", /list-menu__item/, "wears the theme's own classes");
 });
 // Never cloned from the item that opens a dropdown — its markup carries a whole submenu.
 assert.equal($('a[href="/pages/shipping"]').closest("li").find("details").length, 0);
});

test("an item taken out of the menu is removed, and the page it points at is untouched", () => {
 const $ = load(DAWN_MENU_HOME);
 const menu = detectMenus($)!;
 applyMenu($, { menu: { signature: menu.signature, items: menu.items.map((i) => (i.href === "/blogs/news" ? { ...i, hidden: true } : i)) } });
 for (const labels of copies($)) assert.ok(!labels.includes("Shoe Blog"));
});

test("a page she renamed wears its new name in every copy of the menu, with no stored order at all", () => {
 const $ = load(DAWN_MENU_HOME);
 const r = applyMenu($, { menu: null, labels: new Map([["/pages/about-us", "About us"]]) });
 assert.equal(r.changed, true);
 for (const labels of copies($)) assert.ok(labels.includes("About us"), labels.join(","));
 // The address never changes — that is the whole reason renaming needs no redirects.
 assert.equal($('a[href="/pages/about-us"]').length, 3, "two menu copies plus the link in her page");
 // The theme's own markup around the words is kept.
 assert.equal($('.list-menu--inline a[href="/pages/about-us"] span').text(), "About us");
});

test("a page she ADDED and then renamed wears the new name, not the one her menu row was saved with", () => {
 // Her header has no link of its own for a page she added here, so applying her order CLONES one.
 // The stored menu row remembers the name the page had when she added it; the page's own row is the
 // newer truth, and renaming must not need a second write to the menu to take effect.
 const $ = load(DAWN_MENU_HOME);
 const menu = detectMenus($)!;
 const stored: StoredMenu = { signature: menu.signature, items: [...menu.items, { id: "m5", href: "/pages/faq", label: "FAQ" }] };
 const r = applyMenu($, { menu: stored, labels: new Map([["/pages/faq", "FARRRR"]]) });
 assert.equal(r.changed, true);
 for (const labels of copies($)) {
  assert.ok(labels.includes("FARRRR"), labels.join(","));
  assert.ok(!labels.includes("FAQ"), `the old name is still in the menu: ${labels.join(",")}`);
 }
});

test("nothing to do is nothing done", () => {
 const $ = load(DAWN_MENU_HOME);
 const before = $.html();
 assert.deepEqual(applyMenu($, { menu: null }), { copies: 0, changed: false });
 assert.equal($.html(), before);
});

test("what a menu save may store is bounded, and never a link that runs script", () => {
 const items = sanitizeMenuItems([
  { id: "a", label: "  Shop  ", href: "/collections/all" },
  { label: "Bad", href: " javascript:alert(1)" },
  { label: "x".repeat(200), href: "/y" },
  "nope", null,
  ...Array.from({ length: 40 }, (_, i) => ({ label: `n${i}`, href: `/n${i}` })),
 ]);
 assert.equal(items.length, 30);
 assert.equal(items[0].label, "Shop");
 assert.ok(!items.some((i) => /javascript:/i.test(i.href)));
 assert.equal(items[1].label.length, 60);
});
