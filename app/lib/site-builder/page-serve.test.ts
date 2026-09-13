import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { applySiteBuilder, needsSiteBuilder, type SiteBuilderContext } from "./apply.ts";
import { detectMenus } from "./menus.ts";
import { gridMarkerHtml, GRID_DEFAULTS } from "./grid-config.ts";
import { deriveGridKit } from "./grid-kit.ts";
import type { CollectionCardItem } from "../site-capture.ts";
import { DAWN_MENU_HOME, DAWN_COLLECTION, DAWN_HOME } from "./fixtures.ts";

// ONE PASS, ONE PARSE. What a shopper's page gets on a request: her grids filled from live inventory,
// her menu order on every copy of the menu, her hidden pages unlinked, and her page title. They are
// tested together here because they share a single cheerio parse (apply.ts) — the whole reason the
// builder has one entry point rather than four.

const menuOf = (html: string) => detectMenus(cheerio.load(html))!;
const labelsIn = (html: string) => {
 const $ = cheerio.load(html);
 return $(".list-menu--inline li, .menu-drawer__menu > li").map((_i, el) => $(el).find("a, summary").first().text().trim()).get();
};
const piece = (i: number): CollectionCardItem => ({ id: `i${i}`, title: `Piece ${i}`, priceCents: 100 * i, currency: "USD", images: [`https://blob/${i}.jpg`], sourceId: `h${i}`, available: true });

test("nothing of hers on the page: not parsed, not changed", async () => {
 assert.equal(needsSiteBuilder(DAWN_MENU_HOME, {}), false);
 assert.equal(await applySiteBuilder(DAWN_MENU_HOME, {}), DAWN_MENU_HOME);
});

test("her menu order alone reaches the page, with no grid work at all", async () => {
 const menu = menuOf(DAWN_MENU_HOME);
 const moved = { signature: menu.signature, items: [menu.items[4], ...menu.items.slice(0, 4)] };
 let loaded = 0;
 const out = await applySiteBuilder(DAWN_MENU_HOME, { menu: moved, loadItems: async () => { loaded++; return []; } });
 assert.equal(loaded, 0, "no inventory is read for a page with no grid on it");
 for (const copy of [".list-menu--inline li", ".menu-drawer__menu > li"]) {
  const $ = cheerio.load(out);
  assert.equal($(copy).first().find("a, summary").first().text().trim(), "Shoe Blog");
 }
});

test("a hidden page loses its menu links, and her renamed page wears its new name — in both copies", async () => {
 const out = await applySiteBuilder(DAWN_MENU_HOME, {
  hiddenPaths: new Set(["/blogs/news"]),
  menuLabels: new Map([["/pages/about-us", "About us"]]),
 });
 const labels = labelsIn(out);
 assert.ok(!labels.includes("Shoe Blog"), labels.join(","));
 assert.equal(labels.filter((l) => l === "About us").length, 2, "renamed in the desktop list and the drawer");
});

test("her page title replaces the borrowed one in the tab and in og:title", async () => {
 const $ = cheerio.load(await applySiteBuilder(DAWN_MENU_HOME, { pageTitle: "Shipping & Returns" }));
 assert.equal($("title").text(), "Shipping & Returns");
 assert.equal($('meta[property="og:title"]').attr("content"), "Shipping & Returns");
});

test("grids and the menu are applied in the SAME pass", async () => {
 const kit = deriveGridKit([{ path: "/collections/all", html: DAWN_COLLECTION }], DAWN_HOME, "shopify");
 const html = DAWN_MENU_HOME.replace("</main>", `${gridMarkerHtml("g_aaaa1111", { ...GRID_DEFAULTS, count: 3 })}</main>`);
 const menu = menuOf(DAWN_MENU_HOME);
 const ctx: SiteBuilderContext = {
  kit, collections: ["all"], hrefFor: (it) => `/products/${it.sourceId}`,
  loadItems: async () => [piece(1), piece(2), piece(3), piece(4)],
  menu: { signature: menu.signature, items: [menu.items[1], ...menu.items.filter((_, i) => i !== 1)] },
  hiddenPaths: new Set(["/blogs/news"]),
 };
 const $ = cheerio.load(await applySiteBuilder(html, ctx));
 assert.equal($("[data-vya-grid] [data-vya-item]").length, 3, "the grid is live");
 const labels = labelsIn($.html());
 assert.equal(labels[0], "About Us", "and the menu is hers");
 assert.ok(!labels.includes("Shoe Blog"), "and the hidden page is unlinked");
});
