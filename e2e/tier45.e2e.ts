import { test, expect, type Page, type APIRequestContext } from "playwright/test";
import { createHash } from "node:crypto";

// Tiers 4–5, as the owner sees it: a customer carries her notes and tags and the list filters on
// them; a piece's flaws print under Condition on the storefront; a batch of pieces takes one source,
// one date and one lot cost split to the penny.
//
// The customer pages run on fixtures (route interception) so the chips are exact. The product page
// is server-rendered, so flaws are proved on a real throwaway item; the lot split and the customer
// memory round-trip for real on the throwaway store and put back what they touched.

const STORE = process.env.E2E_STORE || "gfdgsgfsgdfs";
const adminToken = () => {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) throw new Error("ADMIN_PASSWORD is required to sign in as the workspace admin");
 return createHash("sha256").update(pw).digest("hex");
};
const cookie = () => ({ Cookie: `via_admin_token=${adminToken()}` });

async function signIn(page: Page) {
 const base = new URL(page.context()["_options"]?.baseURL ?? process.env.E2E_BASE ?? "http://localhost:3001");
 await page.context().addCookies([{ name: "via_admin_token", value: adminToken(), domain: base.hostname, path: "/" }]);
}

const customer = (email: string, o: Partial<{ name: string; tags: string[]; spentCents: number; orders: number; categories: string[]; notes: string | null }> = {}) => ({
 email, name: o.name ?? null, phone: null, location: null, subscribed: true, source: o.orders ? "buyer" : "imported", orders: o.orders ?? 0,
 spentCents: o.spentCents ?? 0, lastOrderAt: null, addedAt: "2026-08-01T00:00:00.000Z", tags: o.tags ?? [], notes: o.notes ?? null, categories: o.categories ?? [],
});
const CUSTOMERS = [
 customer("ana@example.com", { name: "Ana Ribeiro", tags: ["vip", "market:brick-lane"], spentCents: 25_000, orders: 3, categories: ["bags", "coats"], notes: "Size 8, loves 70s prints\nAsked about a Chloé bag" }),
 customer("bo@example.com", { name: "Bo Lind", tags: ["vip"], spentCents: 5_000, orders: 1, categories: ["shoes"] }),
 customer("cy@example.com", { name: "Cy Park" }),
 customer("dee@example.com", { name: "Dee Ahmed", tags: ["market:brick-lane"], spentCents: 5_000, orders: 1, categories: ["bags"] }),
];
const LIST = { count: 4, buyers: 3, revenueCents: 35_000, customers: CUSTOMERS, tags: [{ tag: "vip", count: 2 }, { tag: "market:brick-lane", count: 2 }], categories: ["bags", "coats", "shoes"] };

test.describe("Customers · her memory", () => {
 test("the list filters by tag, spent over and category, and they compose", async ({ page }) => {
  await signIn(page);
  await page.route(/\/api\/store\/customers(\?.*)?$/, (r) => r.fulfill({ json: LIST }));
  await page.goto(`/admin/customers?store=${STORE}`);
  const filters = page.getByTestId("audience-filters");
  await expect(filters).toBeVisible();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(4);
  // Tags are any-of.
  await filters.getByRole("button", { name: "vip", exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(filters).toContainText("2 match");
  await filters.getByRole("button", { name: "market:brick-lane", exact: true }).click();
  await expect(rows).toHaveCount(3);
  // Spent over composes with AND: only Ana has spent more than $50 among the tagged.
  await filters.getByLabel("Spent over").fill("50");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Ana Ribeiro");
  // Category too.
  await filters.getByLabel("Bought in category").selectOption("shoes");
  // The one row left is the empty-state line.
  await expect(page.locator("tbody")).toContainText("No customers match those filters.");
  await expect(rows).toHaveCount(1);
  await expect(filters).toContainText("0 match");
  // The filter travels to the composer as the same query string the page reads.
  const link = page.getByTestId("audience-filters").locator("a", { hasText: "Email these" });
  await expect(link).toHaveAttribute("href", /tag=vip%2Cmarket%3Abrick-lane/);
  await expect(link).toHaveAttribute("href", /spentOver=50/);
  await expect(link).toHaveAttribute("href", /category=shoes/);
 });

 test("?tag= and ?spentOver= arrive pre-applied, and rows show their tags", async ({ page }) => {
  await signIn(page);
  await page.route(/\/api\/store\/customers(\?.*)?$/, (r) => r.fulfill({ json: LIST }));
  await page.goto(`/admin/customers?store=${STORE}&tag=market:brick-lane&spentOver=100`);
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Ana Ribeiro");
  await expect(rows.first()).toContainText("market:brick-lane");
  await expect(page.getByTestId("audience-filters")).toContainText("Email these 1");
 });

 test("the profile shows her tags and note", async ({ page }) => {
  await signIn(page);
  await page.route(/\/api\/store\/customers\/profile/, (r) => r.fulfill({ json: { ok: true, profile: CUSTOMERS[0], orders: [], offers: [], conversations: [], allTags: ["vip", "market:brick-lane", "wholesale"] } }));
  await page.goto(`/admin/customers/${encodeURIComponent("ana@example.com")}?store=${STORE}`);
  const memory = page.getByTestId("customer-memory");
  await expect(memory).toBeVisible();
  await expect(page.getByTestId("customer-tags")).toContainText("vip");
  await expect(page.getByTestId("customer-tags")).toContainText("market:brick-lane");
  await expect(page.locator("#customer-notes")).toHaveValue(/Size 8, loves 70s prints/);
  // A tag already on her is not offered again; one that isn't, is.
  await expect(memory.getByRole("button", { name: "+ wholesale" })).toBeVisible();
  await expect(memory.getByRole("button", { name: "+ vip" })).toHaveCount(0);
 });

 test("notes and tags round-trip on the real route, then are put back", async ({ request }: { request: APIRequestContext }) => {
  const email = "e2e-tier45@example.com";
  const before = await request.get(`/api/store/customers/profile?email=${encodeURIComponent(email)}&store=${STORE}`, { headers: cookie() });
  expect(before.status()).toBe(200);
  const was = (await before.json()).profile as { tags?: string[]; notes?: string | null };
  try {
   const patch = await request.patch(`/api/store/customers/profile?store=${STORE}`, { headers: cookie(), data: { email, notes: "Loves 70s prints", tags: ["E2E-VIP", "market:brick-lane"] } });
   expect(patch.status(), await patch.text()).toBe(200);
   const saved = (await patch.json()).profile;
   expect(saved.notes).toBe("Loves 70s prints");
   expect(saved.tags).toEqual(["e2e-vip", "market:brick-lane"]);
   const after = await request.get(`/api/store/customers/profile?email=${encodeURIComponent(email)}&store=${STORE}`, { headers: cookie() });
   const p = (await after.json()).profile;
   expect(p.tags).toEqual(["e2e-vip", "market:brick-lane"]);
   expect(p.notes).toBe("Loves 70s prints");
   // The list's filters see the same thing the campaign will.
   const list = await request.get(`/api/store/customers?store=${STORE}`, { headers: cookie() });
   const tags = ((await list.json()).tags as { tag: string }[]).map((t) => t.tag);
   expect(tags).toContain("e2e-vip");
   const count = await request.get(`/api/store/campaign?store=${STORE}&tag=e2e-vip`, { headers: cookie() });
   expect(count.status()).toBe(200);
   expect((await count.json()).recipientCount).toBe(1);
  } finally {
   const back = await request.patch(`/api/store/customers/profile?store=${STORE}`, { headers: cookie(), data: { email, notes: was.notes ?? null, tags: was.tags ?? [] } });
   expect(back.status()).toBe(200);
  }
 });
});

test.describe("A piece · flaws and where it came from", () => {
 test("flaws print under Condition on the storefront, as a list", async ({ page, request }) => {
  const sf = await request.get(`/api/store/storefront?store=${STORE}`, { headers: cookie() });
  expect(sf.status()).toBe(200);
  const handle = ((await sf.json()).settings?.handle ?? STORE) as string;
  const created = await request.post(`/api/store/intake/publish?store=${STORE}`, {
   headers: cookie(),
   data: { title: "E2E flawed cardigan", price: 40, condition: "Good", category: "knitwear", status: "draft", flaws: ["light pilling at cuffs", "Good", "small hole at hem", " light pilling at cuffs "] },
  });
  expect(created.status(), await created.text()).toBe(200);
  const id = (await created.json()).itemId as string;
  try {
   // The list is normalised: trimmed, deduped, and the flaw that just repeats the condition dropped.
   const items = await request.get(`/api/store/items?store=${STORE}`, { headers: cookie() });
   const mine = ((await items.json()).items as { id: string; flaws?: string[] }[]).find((i) => i.id === id);
   expect(mine?.flaws).toEqual(["light pilling at cuffs", "small hole at hem"]);

   await signIn(page);
   const res = await page.goto(`/s/${handle}/p/${id}?preview=1`);
   test.skip(res?.status() === 404, "the test store has no storefront to render a product page on");
   const flaws = page.getByTestId("flaws");
   await expect(flaws).toBeVisible();
   await expect(flaws).toContainText("Flaws");
   await expect(flaws.locator("li")).toHaveCount(2);
   await expect(flaws.locator("li").nth(0)).toHaveText("light pilling at cuffs");
   // Under Condition: the Condition fact comes first in the document.
   const condition = page.getByText("Condition", { exact: true }).first();
   if (await condition.count()) {
    const order = await page.evaluate(() => {
     const f = document.querySelector('[data-testid="flaws"]');
     const c = Array.from(document.querySelectorAll("p")).find((p) => p.textContent?.trim() === "Condition");
     return f && c ? (c.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : null;
    });
    expect(order).not.toBe(false);
   }

   // An edit replaces the list; an empty list prints nothing.
   const cleared = await request.patch(`/api/store/items/${id}?store=${STORE}`, { headers: cookie(), data: { flaws: [] } });
   expect(cleared.status()).toBe(200);
   await page.reload();
   await expect(page.getByTestId("flaws")).toHaveCount(0);
  } finally {
   // For good, not "removed": a removed row would still surface in the store's search.
   const gone = await request.delete(`/api/store/items/${id}?store=${STORE}`, { headers: cookie() });
   expect(gone.status(), await gone.text()).toBe(200);
  }
 });

 test("a lot's cost is split by price, to the penny, and the source lands on every piece", async ({ request }) => {
  const make = async (title: string, price: number) => {
   const r = await request.post(`/api/store/intake/publish?store=${STORE}`, { headers: cookie(), data: { title, price, category: "bags", status: "draft" } });
   expect(r.status(), await r.text()).toBe(200);
   return (await r.json()).itemId as string;
  };
  const coat = await make("E2E lot coat", 200);
  const scarf = await make("E2E lot scarf", 50);
  try {
   const lot = await request.post(`/api/store/items?store=${STORE}`, { headers: cookie(), data: { action: "lot", ids: [coat, scarf], sourceName: "E2E Kempton", acquiredAt: "2026-09-01", lotCostCents: 10_000 } });
   expect(lot.status(), await lot.text()).toBe(200);
   const body = await lot.json();
   expect(body.count).toBe(2);
   expect(body.costs).toEqual({ [coat]: 8000, [scarf]: 2000 });
   expect(body.lotId).toMatch(/^lot_/);

   const items = await request.get(`/api/store/items?store=${STORE}`, { headers: cookie() });
   const all = (await items.json()).items as { id: string; costCents: number | null; sourceName?: string | null; acquiredAt?: string | null; lotId?: string | null }[];
   const c = all.find((i) => i.id === coat)!, s = all.find((i) => i.id === scarf)!;
   expect(c.costCents).toBe(8000);
   expect(s.costCents).toBe(2000);
   expect(c.sourceName).toBe("E2E Kempton");
   expect(s.sourceName).toBe("E2E Kempton");
   expect(String(c.acquiredAt).slice(0, 10)).toBe("2026-09-01");
   expect(c.lotId).toBe(body.lotId);
   expect(s.lotId).toBe(body.lotId);

   // "Set cost": a total split the same way; each the same on every piece.
   const each = await request.post(`/api/store/items?store=${STORE}`, { headers: cookie(), data: { action: "cost", ids: [coat, scarf], eachCents: 1234 } });
   expect(each.status()).toBe(200);
   expect((await each.json()).costs).toEqual({ [coat]: 1234, [scarf]: 1234 });
   const total = await request.post(`/api/store/items?store=${STORE}`, { headers: cookie(), data: { action: "cost", ids: [coat, scarf], totalCents: 10 } });
   expect((await total.json()).costs).toEqual({ [coat]: 8, [scarf]: 2 });
  } finally {
   for (const id of [coat, scarf]) {
    const gone = await request.delete(`/api/store/items/${id}?store=${STORE}`, { headers: cookie() });
    expect(gone.status(), await gone.text()).toBe(200);
   }
  }
 });
});
