import { test, expect, type Page, type APIRequestContext } from "playwright/test";
import { createHash } from "node:crypto";

// Tier 2, as the owner sees it: a hold she placed shows up on Home the day it lapses, stock that
// has sat 90 days is named on Home and sortable in Inventory, and the holds API round-trips.
//
// Home and Inventory run on fixtures (route interception) so the numbers are exact. The hold
// lifecycle runs for real against the throwaway test store and releases what it held.

const STORE = process.env.E2E_STORE || "gfdgsgfsgdfs";
const adminToken = () => {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) throw new Error("ADMIN_PASSWORD is required to sign in as the workspace admin");
 return createHash("sha256").update(pw).digest("hex");
};
const cookie = () => ({ Cookie: `via_admin_token=${adminToken()}` });

async function signIn(page: Page) {
 const base = new URL(process.env.E2E_BASE ?? "http://localhost:3001");
 await page.context().addCookies([{ name: "via_admin_token", value: adminToken(), domain: base.hostname, path: "/" }]);
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const item = (id: string, title: string, days: number, status = "active") => ({
 id, sku: 1, title, priceCents: 12_000, costCents: null, currency: "USD", images: [], brand: null, era: null, material: null, colour: null,
 condition: null, size: null, category: null, description: null, status, weightOz: null, lengthIn: null, widthIn: null, heightIn: null,
 collections: [], createdAt: daysAgo(days),
});
const ITEMS = [
 item("i-fresh", "Fresh cardigan", 2),
 item("i-mid", "Sixty-day skirt", 65),
 item("i-old", "Ancient coat", 130),
 item("i-sold", "Sold ages ago", 400, "sold"),
];
const HOLDS = {
 holds: [{ itemId: "i-mid", name: "Ana", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), title: "Sixty-day skirt", image: null, priceCents: 12_000, currency: "USD" }],
 today: [{ itemId: "i-mid", name: "Ana", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), title: "Sixty-day skirt", image: null, priceCents: 12_000, currency: "USD" }],
 thisWeek: [],
};

async function mockStore(page: Page) {
 await page.route(/\/api\/store\/items(\?.*)?$/, (r) => r.fulfill({ json: { ok: true, items: ITEMS, isAdmin: true } }));
 await page.route(/\/api\/store\/holds/, (r) => r.fulfill({ json: HOLDS }));
}

test.describe("Home · what needs her today", () => {
 test("a hold lapsing today and stock over 90 days each get a tile", async ({ page }) => {
  await signIn(page);
  await mockStore(page);
  await page.goto(`/admin/home?store=${STORE}`);
  const hold = page.locator("a", { hasText: /Hold lapses today/ });
  await expect(hold).toBeVisible();
  await expect(hold).toContainText("Ana");
  await expect(hold).toHaveAttribute("href", /status=reserved/);
  const aging = page.locator("a", { hasText: /Listed over 90 days/ });
  await expect(aging).toBeVisible();
  await expect(aging).toContainText("1"); // only the 130-day piece; the sold one does not age
  await expect(aging).toHaveAttribute("href", /sort=oldest/);
 });

 test("with nothing lapsing and nothing old, neither tile appears", async ({ page }) => {
  await signIn(page);
  await page.route(/\/api\/store\/items(\?.*)?$/, (r) => r.fulfill({ json: { ok: true, items: [ITEMS[0]], isAdmin: true } }));
  await page.route(/\/api\/store\/holds/, (r) => r.fulfill({ json: { holds: [], today: [], thisWeek: [] } }));
  await page.goto(`/admin/home?store=${STORE}`);
  await expect(page.getByText("Live listings")).toBeVisible();
  await expect(page.getByText(/Hold lapses today|Holds lapse today/)).toHaveCount(0);
  await expect(page.getByText(/Listed over \d+ days/)).toHaveCount(0);
 });
});

test.describe("Inventory · days on the rail", () => {
 test("the Days column shows each live piece's age, and ?sort=oldest puts the oldest first", async ({ page }) => {
  await signIn(page);
  await mockStore(page);
  await page.goto(`/admin/inventory?store=${STORE}&sort=oldest`);
  const table = page.locator("table").first();
  await expect(table.getByRole("button", { name: /^Days/ })).toBeVisible();
  const titles = table.locator("tbody tr").locator("td:nth-child(2)");
  await expect(titles.first()).toContainText("Ancient coat");
  // The 130-day piece reads as a decision, in rose; the 65-day one as a question, in amber.
  const oldRow = table.locator("tbody tr", { hasText: "Ancient coat" });
  await expect(oldRow.locator("span.text-rose-600")).toHaveText("130");
  const midRow = table.locator("tbody tr", { hasText: "Sixty-day skirt" });
  await expect(midRow.locator("span.text-amber-600")).toHaveText("65");
 });
});

test.describe("The real routes", () => {
 test("holds round-trip: hold a live piece, see it listed, release it", async ({ request }) => {
  const list = await request.get(`/api/store/items?store=${STORE}`, { headers: cookie() });
  expect(list.status()).toBe(200);
  const live = ((await list.json()).items as { id: string; status: string }[]).find((i) => i.status === "active");
  test.skip(!live, "the test store has no live piece to hold");
  const id = live!.id;
  try {
   const hold = await request.post(`/api/store/items/${id}?store=${STORE}`, { headers: cookie(), data: { action: "hold", name: "E2E Ana", days: 1 } });
   expect(hold.status(), await hold.text()).toBe(200);
   expect((await hold.json()).item.status).toBe("reserved");

   const holds = await request.get(`/api/store/holds?store=${STORE}`, { headers: cookie() });
   expect(holds.status()).toBe(200);
   const body = await holds.json();
   const mine = (body.holds as { itemId: string; name: string }[]).find((h) => h.itemId === id);
   expect(mine?.name).toBe("E2E Ana");
   // A one-day hold lapses within the week, and "today" is a subset of it.
   expect([...body.today, ...body.thisWeek].some((h: { itemId: string }) => h.itemId === id)).toBe(true);

   // Holding it again is refused — it is already held.
   const again = await request.post(`/api/store/items/${id}?store=${STORE}`, { headers: cookie(), data: { action: "hold", name: "Someone else", days: 1 } });
   expect(again.status()).toBe(409);
  } finally {
   const release = await request.post(`/api/store/items/${id}?store=${STORE}`, { headers: cookie(), data: { action: "release" } });
   expect(release.status(), await release.text()).toBe(200);
   expect((await release.json()).item.status).toBe("active");
  }
 });

 test("a hold in the past or past a month is refused before it touches anything", async ({ request }) => {
  const list = await request.get(`/api/store/items?store=${STORE}`, { headers: cookie() });
  const live = ((await list.json()).items as { id: string; status: string }[]).find((i) => i.status === "active");
  test.skip(!live, "the test store has no live piece to hold");
  const r1 = await request.post(`/api/store/items/${live!.id}?store=${STORE}`, { headers: cookie(), data: { action: "hold", days: 45 } });
  expect(r1.status()).toBe(400);
  expect((await r1.json()).error).toMatch(/30 days/);
  const r2 = await request.post(`/api/store/items/${live!.id}?store=${STORE}`, { headers: cookie(), data: { action: "hold", until: "2020-01-01T00:00:00Z" } });
  expect(r2.status()).toBe(400);
  expect((await r2.json()).error).toMatch(/future/);
 });

 test("search answers with the status written into each row", async ({ request }) => {
  const r = await request.get(`/api/store/search?q=a&store=${STORE}`, { headers: cookie() });
  expect(r.status()).toBe(200);
  const groups = (await r.json()).groups as { group: string; hits: { sub: string }[] }[];
  const inv = groups.find((g) => g.group === "Inventory");
  if (inv) expect(inv.hits[0].sub).toMatch(/active|draft|sold|reserved/);
 });
});

test.describe("Inventory · search that matches nothing", () => {
 test("the search box stays put and keeps focus when nothing matches", async ({ page }) => {
  await signIn(page);
  await mockStore(page);
  await page.goto(`/admin/inventory?store=${STORE}`);
  const box = page.getByPlaceholder(/filter by name/i); // the one search box on the page, in the toolbar
  await box.click();
  await box.fill("zzzz-nothing-has-this-name");
  await expect(page.getByText("No matches")).toBeVisible();
  // The box is still on the page, still focused, and Backspace still works.
  await expect(box).toBeVisible();
  await expect(box).toBeFocused();
  await box.press("Backspace");
  await expect(box).toHaveValue("zzzz-nothing-has-this-nam");
  await box.fill("");
  await expect(page.getByText("Ancient coat")).toBeVisible();
 });
});
