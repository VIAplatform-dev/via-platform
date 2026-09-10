import { test } from "node:test";
import assert from "node:assert/strict";
import { GROUPS, MARKET_GROUPS, MARKET_TABS, visibleNavGroups, type NavGroup } from "./nav.ts";

// The sidebar is the one from before the owner audit, restored on 2026-09-08 at the owner's
// request ("restore the old sidebar, don't change it"). This test pins it so a later cleanup has
// to be a decision, not a drift.

const labels = (groups: NavGroup[]) => groups.flatMap((g) => g.items.flatMap((n) => [n.label, ...(n.children ?? []).map((c) => c.label)]));
const hrefs = (groups: NavGroup[]) => groups.flatMap((g) => g.items.flatMap((n) => [n.href, ...(n.children ?? []).map((c) => c.href)]));
const group = (groups: NavGroup[], label: string) => groups.find((g) => g.label === label);

test("the groups and rows are the pre-audit sidebar, in order", () => {
 assert.deepEqual(GROUPS.map((g) => g.label ?? "(top)"), ["(top)", "Sell", "Store", "Apps", "Business", "Platform"]);
 assert.deepEqual(group(GROUPS, "Sell")!.items.map((n) => n.label), ["Inventory", "Cross-listing", "Consignment", "Rentals", "Appointments", "Orders", "Inbox"]);
 assert.deepEqual(group(GROUPS, "Sell")!.items[0].children!.map((c) => c.label), ["Add listing", "Bulk upload", "Collections", "Drafts", "Sold"]);
 assert.deepEqual(group(GROUPS, "Store")!.items.map((n) => n.label), ["Storefront", "Bring your site", "Customers", "Marketing", "Discounts"]);
 assert.deepEqual(group(GROUPS, "Store")!.items[0].children!.map((c) => c.label), ["Edit site", "Drafts", "Your domain"]);
 assert.deepEqual(group(GROUPS, "Store")!.items[2].children!.map((c) => c.label), ["Buyers", "Cart recovery"]);
 assert.deepEqual(group(GROUPS, "Business")!.items.map((n) => n.label), ["Analytics", "Settings"]);
 assert.deepEqual(group(GROUPS, "Business")!.items[1].children!.map((c) => c.label), ["General", "Plan & billing", "Payments", "Shipping & duties", "Sales tax"]);
 assert.deepEqual(group(GROUPS, "Platform")!.items.map((n) => n.label), ["Trends", "AI accuracy", "Golden set", "Where stores get stuck", "Admin access"]);
});

test("a seller never sees the Platform group, Apps, or Bring your site; the owner does", () => {
 const seller = visibleNavGroups({ isOwner: false, rentalsOn: false, apptsOn: false, inboxOff: false });
 assert.equal(group(seller, "Platform"), undefined);
 assert.equal(group(seller, "Apps"), undefined);
 assert.ok(!hrefs(seller).includes("/admin/import"));
 const owner = visibleNavGroups({ isOwner: true, rentalsOn: false, apptsOn: false, inboxOff: false });
 assert.ok(group(owner, "Platform"));
 assert.ok(hrefs(owner).includes("/admin/import"));
 assert.ok(hrefs(owner).includes("/admin/setup-funnel"));
 // A page that hands out admin access must never render in a store partner's rail.
 assert.ok(!hrefs(seller).includes("/admin/users"));
 assert.ok(hrefs(owner).includes("/admin/users"));
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
 const unknown = visibleNavGroups({ isOwner: false, rentalsOn: null, apptsOn: null, inboxOff: false });
 assert.ok(!hrefs(unknown).includes("/admin/rentals"));
});

test("Market Mode's rows are the pre-audit ones", () => {
 assert.deepEqual(labels(MARKET_GROUPS), ["Market home", "Find item", "Quick list", "Cart", "Sales today", "At this market", "Bring list", "Setup", "Payments"]);
 assert.equal(MARKET_GROUPS.flatMap((g) => g.items).find((n) => n.label === "Payments")!.href, "/admin/payments");
});

test("the nav is data: icons are names, so Node can load it without React", () => {
 for (const n of [...GROUPS, ...MARKET_GROUPS].flatMap((g) => g.items)) assert.equal(typeof n.icon, "string");
 for (const t of MARKET_TABS) assert.equal(typeof t.icon, "string");
});

// ── children on the rows that earn them ────────────────────────────────────────────────────────
// Not every row: a flat list of thirty links is the thing a sidebar exists to avoid. Analytics earned
// children because Profit & loss is a page of its own; Rentals and Appointments are one page each.
test("Analytics expands to its own pages", () => {
 const item = GROUPS.flatMap((g) => g.items).find((i) => i.label === "Analytics");
 assert.ok(item);
 assert.deepEqual(item!.children?.map((c) => c.label), ["Overview", "Profit & loss"]);
});

test("Rentals and Appointments stay flat — one page each, so a child would only add a click", () => {
 const items = GROUPS.flatMap((g) => g.items);
 for (const label of ["Rentals", "Appointments"]) {
  const it = items.find((i) => i.label === label);
  assert.ok(it, `${label} is in the sidebar`);
  assert.equal(it!.children, undefined, `${label} has no children`);
 }
});

test("every child points somewhere under /admin", () => {
 for (const g of GROUPS) for (const i of g.items) for (const c of i.children ?? []) {
  assert.match(c.href, /^\/admin\//, `${c.label} → ${c.href}`);
 }
});
