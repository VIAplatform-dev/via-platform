import { test } from "node:test";
import assert from "node:assert/strict";
import { GROUPS, MARKET_GROUPS, MARKET_TABS, visibleNavGroups, type NavGroup } from "./nav.ts";
import { SETTINGS_SECTIONS } from "./settings/sections.ts";

// The sidebar as data. What a seller sees in her left rail is a product decision, and a product
// decision should be testable without rendering a tree: one Payments, one Analytics, no dead
// duplicates, and the words a seller would use ("Add a piece", "Abandoned carts").

const labels = (groups: NavGroup[]) => groups.flatMap((g) => g.items.flatMap((n) => [n.label, ...(n.children ?? []).map((c) => c.label)]));
const hrefs = (groups: NavGroup[]) => groups.flatMap((g) => g.items.flatMap((n) => [n.href, ...(n.children ?? []).map((c) => c.href)]));
const find = (groups: NavGroup[], label: string) => groups.flatMap((g) => g.items).find((n) => n.label === label);
const group = (groups: NavGroup[], label: string) => groups.find((g) => g.label === label);

test("Payments and Analytics are never in the workspace nav twice", () => {
 // Payments reached the sidebar only by way of Settings' expanded children. Settings doesn't
 // expand any more, so it's zero here and one in the settings index — what matters is that a
 // seller never sees the same destination under two different names.
 const all = labels(GROUPS);
 assert.ok(all.filter((l) => l === "Payments").length <= 1);
 assert.equal(all.filter((l) => l === "Analytics").length, 1);
 assert.equal(SETTINGS_SECTIONS.filter((s) => s.label === "Payments").length, 1);
});

test("Market Mode's Payments is the same Payments as Settings, not a second one", () => {
 // One place to look, whichever mode she is in.
 const market = labels(MARKET_GROUPS);
 assert.equal(market.filter((l) => l === "Payments").length, 1);
 assert.equal(market.filter((l) => l === "Analytics").length, 0);
 const marketPay = MARKET_GROUPS.flatMap((g) => g.items).find((n) => n.label === "Payments");
 const settingsPay = SETTINGS_SECTIONS.find((s) => s.label === "Payments");
 assert.ok(marketPay && settingsPay);
 assert.equal(marketPay.href, settingsPay.href);
 assert.equal(marketPay.href, "/admin/settings/payments");
});

test("Storefront's children say Site versions, never Drafts (Drafts are listings)", () => {
 const sf = find(GROUPS, "Storefront");
 assert.ok(sf?.children);
 const kids = sf.children.map((c) => c.label);
 assert.ok(kids.includes("Site versions"));
 assert.ok(!kids.includes("Drafts"));
});

test("listing a piece is one entry, under Inventory, called Add a listing", () => {
 // It had a top-level row of its own for a while. Two entries pointing at the same page read as
 // two features, and the page is called Add a listing — so the sidebar says that too.
 const sell = group(GROUPS, "Sell");
 assert.ok(sell);
 assert.equal(sell.items[0].label, "Inventory");
 assert.ok(!labels(GROUPS).includes("Add a piece"));
 const inv = find(GROUPS, "Inventory");
 const add = (inv?.children ?? []).filter((c) => c.href === "/admin/add-listing");
 assert.equal(add.length, 1);
 assert.equal(add[0].label, "Add a listing");
 // …and Inventory stays lit while she's on it.
 assert.ok((inv?.match ?? []).includes("/admin/add-listing"));
});

test("the words a seller would use: Import your site, Abandoned carts", () => {
 const all = labels(GROUPS);
 assert.ok(all.includes("Import your site"));
 assert.ok(all.includes("Abandoned carts"));
 assert.ok(!all.includes("Bring your site"));
 assert.ok(!all.includes("Cart recovery"));
});

test("a seller never sees VYA's own instruments or the one-time import", () => {
 const seller = visibleNavGroups({ isOwner: false, rentalsOn: false, apptsOn: false, inboxOff: false });
 assert.equal(group(seller, "Platform"), undefined);
 assert.ok(!hrefs(seller).includes("/admin/import"));
 const owner = visibleNavGroups({ isOwner: true, rentalsOn: false, apptsOn: false, inboxOff: false });
 assert.ok(group(owner, "Platform"));
 assert.ok(hrefs(owner).includes("/admin/import"));
});

test("rentals, appointments and the inbox follow their switches", () => {
 const off = visibleNavGroups({ isOwner: false, rentalsOn: false, apptsOn: false, inboxOff: true });
 assert.ok(!hrefs(off).includes("/admin/rentals"));
 assert.ok(!hrefs(off).includes("/admin/appointments"));
 assert.ok(!hrefs(off).includes("/admin/inbox"));
 const on = visibleNavGroups({ isOwner: false, rentalsOn: true, apptsOn: true, inboxOff: false });
 assert.ok(hrefs(on).includes("/admin/rentals"));
 assert.ok(hrefs(on).includes("/admin/appointments"));
 assert.ok(hrefs(on).includes("/admin/inbox"));
 // Not-yet-known (null) reads as off, the same as the layout has always treated it.
 const unknown = visibleNavGroups({ isOwner: false, rentalsOn: null, apptsOn: null, inboxOff: false });
 assert.ok(!hrefs(unknown).includes("/admin/rentals"));
});

test("Settings doesn't expand — its own page is the index", () => {
 // Sixteen children put the identical list on screen twice: once down the sidebar, once in the
 // settings page's own grouped index. The grouped one is better, and it's on every settings page.
 const settings = find(GROUPS, "Settings");
 assert.ok(settings);
 assert.equal(settings.children, undefined);
 // Apps & integrations is a setting, not a section of the shop — no group of its own.
 assert.equal(group(GROUPS, "Apps"), undefined);
 assert.ok(SETTINGS_SECTIONS.some((s) => s.href === "/admin/apps" && s.label === "Apps & integrations"));
});

test("the nav is data: icons are names, so Node can load it without React", () => {
 for (const n of [...GROUPS, ...MARKET_GROUPS].flatMap((g) => g.items)) assert.equal(typeof n.icon, "string");
 for (const t of MARKET_TABS) assert.equal(typeof t.icon, "string");
});
