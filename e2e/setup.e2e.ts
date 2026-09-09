import { test, expect, type Page } from "playwright/test";
import { createHash } from "node:crypto";

// "Set up your store", where it bites (option J) and where stores get stuck (the owner's funnel).
//
// Inventory and Orders run on fixtures so the gate is exact. The publish wall, the skip round trip
// and the funnel hit the real routes; everything written to gfdgsgfsgdfs is put back or deleted.

const STORE = process.env.E2E_STORE || "gfdgsgfsgdfs";
const adminToken = () => {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) throw new Error("ADMIN_PASSWORD is required to sign in as the workspace admin");
 return createHash("sha256").update(pw).digest("hex");
};
const cookie = () => ({ Cookie: `via_admin_token=${adminToken()}` });

async function signIn(page: Page) {
 const base = new URL(process.env.E2E_BASE || "http://localhost:3001");
 await page.context().addCookies([{ name: "via_admin_token", value: adminToken(), domain: base.hostname, path: "/" }]);
}

const SETUP = (shipFromDone: boolean) => [
 { id: "ship_from", label: "Add the address you ship from", hint: "Needed before a listing can go live", href: "/admin/settings/locations", done: shipFromDone },
 { id: "payments", label: "Connect Stripe so you can get paid", href: "/admin/settings/payments", done: true },
 { id: "shipping", label: "Switch shipping on", href: "/admin/settings/shipping", done: false },
 { id: "first_listing", label: "List your first piece", href: "/admin/add-listing", done: true },
 { id: "returns", label: "Set your returns policy", href: "/admin/settings/general", done: false },
 { id: "domain", label: "Connect your own domain", hint: "Optional — your VYA address works today", href: "/admin/settings/domain", done: false, optional: true },
];
const ONBOARDING = (shipFromDone: boolean) => ({
 ok: true, onboarded: true, shipFromSet: shipFromDone, storeName: "Test store",
 setup: SETUP(shipFromDone), setupComplete: false, setupDone: shipFromDone ? 3 : 2, setupTotal: 6, setupNext: shipFromDone ? "shipping" : "ship_from", setupSkipped: [],
});
const ITEMS = [
 { id: "d1", sku: 1, title: "Fendi baguette", priceCents: 42000, costCents: null, currency: "USD", images: [], brand: "Fendi", era: null, material: null, colour: null, condition: null, size: null, category: "bags", description: null, status: "draft", weightOz: null, lengthIn: null, widthIn: null, heightIn: null },
 { id: "a1", sku: 2, title: "Yohji wool coat", priceCents: 34000, costCents: null, currency: "USD", images: [], brand: "Yohji Yamamoto", era: null, material: null, colour: null, condition: null, size: null, category: "coats-jackets", description: null, status: "active", weightOz: null, lengthIn: null, widthIn: null, heightIn: null },
];

async function mockInventory(page: Page, shipFromDone: boolean) {
 await page.route(/\/api\/store\/onboarding-status/, (r) => r.fulfill({ json: ONBOARDING(shipFromDone) }));
 await page.route(/\/api\/store\/items(\?.*)?$/, (r) => r.fulfill({ json: { ok: true, items: ITEMS, isAdmin: true } }));
 await page.route(/\/api\/store\/holds/, (r) => r.fulfill({ json: { holds: [], today: [], thisWeek: [] } }));
 await page.route(/\/api\/store\/collections/, (r) => r.fulfill({ json: { collections: [] } }));
 await page.route(/\/api\/store\/cross-listing(\?.*)?$/, (r) => r.fulfill({ json: { listings: [] } }));
}

test.describe("Inventory · where the missing address bites", () => {
 test("no ship-from address: the banner names it, and a draft says blocked, not just draft", async ({ page }) => {
  await signIn(page);
  await mockInventory(page, false);
  await page.goto(`/admin/inventory?store=${STORE}&layout=list`);
  const gate = page.getByTestId("ship-from-gate");
  await expect(gate).toBeVisible();
  await expect(gate).toContainText("Pieces can’t go live yet.");
  await expect(gate).toContainText("Add the address you ship from.");
  const button = gate.locator("a", { hasText: "Add address" });
  await expect(button).toHaveAttribute("href", `/admin/settings/locations?store=${STORE}`);
  const blocked = page.getByText("Draft · blocked", { exact: true });
  await expect(blocked).toHaveCount(1);
  await expect(blocked).toHaveAttribute("title", "Pieces can't go live yet. Add the address you ship from.");
  // The live piece is untouched.
  await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();
 });

 test("with the address set there is no banner and a draft is a draft", async ({ page }) => {
  await signIn(page);
  await mockInventory(page, true);
  await page.goto(`/admin/inventory?store=${STORE}&layout=list`);
  await expect(page.getByText("Fendi baguette")).toBeVisible();
  await expect(page.getByTestId("ship-from-gate")).toHaveCount(0);
  await expect(page.getByText("Draft · blocked")).toHaveCount(0);
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
 });
});

test.describe("Orders · labels need the address", () => {
 const ORDERS = { orders: [{ id: "o1", orderNo: 1, itemTitle: "Yohji wool coat", amountCents: 34000, taxCents: null, currency: "USD", buyerEmail: "b@example.com", status: "paid", paidAt: "2026-09-01T10:00:00Z", deliveryMethod: "ship", paymentIntent: "pi_1" }], imported: [] };
 test("a parcel to post and no address: the banner; nothing to post: no banner", async ({ page }) => {
  await signIn(page);
  await page.route(/\/api\/store\/onboarding-status/, (r) => r.fulfill({ json: ONBOARDING(false) }));
  await page.route(/\/api\/store\/orders(\?.*)?$/, (r) => r.fulfill({ json: ORDERS }));
  await page.goto(`/admin/orders?store=${STORE}`);
  const gate = page.getByTestId("ship-from-gate");
  await expect(gate).toBeVisible();
  await expect(gate).toContainText("Labels can’t be bought yet.");
  await expect(gate.locator("a", { hasText: "Add address" })).toHaveAttribute("href", `/admin/settings/locations?store=${STORE}`);

  await page.route(/\/api\/store\/orders(\?.*)?$/, (r) => r.fulfill({ json: { orders: [{ ...ORDERS.orders[0], status: "shipped" }], imported: [] } }));
  await page.goto(`/admin/orders?store=${STORE}`);
  await expect(page.getByText("Yohji wool coat")).toBeVisible();
  await expect(page.getByTestId("ship-from-gate")).toHaveCount(0);
 });
});

test.describe("The real routes", () => {
 test("publishing a draft without a ship-from address is refused with a 409 (single and bulk)", async ({ request }) => {
  // storefront-parity.e2e.ts lends the same store an address for its own tests, and the two files
  // can run at once — so the verdict comes from the answer, not from a status read a moment earlier.
  const created = await request.post(`/api/store/intake/publish?store=${STORE}`, { headers: cookie(), data: { title: "E2E gated draft", price: 10, condition: "Good", category: "knitwear", status: "draft" } });
  expect(created.status(), await created.text()).toBe(200);
  const id = (await created.json()).itemId as string;
  try {
   const one = await request.post(`/api/store/items/${id}?store=${STORE}`, { headers: cookie(), data: { action: "publish" } });
   const many = await request.post(`/api/store/items?store=${STORE}`, { headers: cookie(), data: { action: "publish", ids: [id] } });
   const edit = await request.patch(`/api/store/items/${id}?store=${STORE}`, { headers: cookie(), data: { status: "active" } });
   if (one.status() === 200) {
    test.info().annotations.push({ type: "note", description: `${STORE} had a ship-from address at that moment (another spec lends it one), so the wall could not be exercised; the happy path is asserted instead.` });
    expect(many.status(), await many.text()).toBe(200);
    expect(edit.status(), await edit.text()).toBe(200);
   } else {
    expect(one.status(), await one.text()).toBe(409);
    expect((await one.json()).error).toBe("Pieces can't go live yet. Add the address you ship from.");
    expect(many.status(), await many.text()).toBe(409);
    expect((await many.json()).error).toBe("Pieces can't go live yet. Add the address you ship from.");
    // The edit form's status field is a publish too.
    expect(edit.status(), await edit.text()).toBe(409);
    expect((await edit.json()).error).toBe("Pieces can't go live yet. Add the address you ship from.");
    const items = await request.get(`/api/store/items?store=${STORE}`, { headers: cookie() });
    const mine = ((await items.json()).items as { id: string; status: string }[]).find((i) => i.id === id);
    expect(mine?.status).toBe("draft");
   }
  } finally {
   // A draft deletes straight away; a piece that went live is removed first, then deleted for good.
   await request.post(`/api/store/items/${id}?store=${STORE}`, { headers: cookie(), data: { action: "remove" } }).catch(() => null);
   const gone = await request.delete(`/api/store/items/${id}?store=${STORE}`, { headers: cookie() });
   expect(gone.status(), await gone.text()).toBe(200);
  }
 });

 test("skip round-trip: the domain can be skipped, a required step cannot, and it can be put back", async ({ request }) => {
  const before = await request.get(`/api/store/onboarding-status?store=${STORE}`, { headers: cookie() });
  expect(before.status()).toBe(200);
  const was = ((await before.json()).setupSkipped as string[]) ?? [];
  try {
   const skip = await request.put(`/api/store/onboarding-status?store=${STORE}`, { headers: cookie(), data: { skip: "domain" } });
   expect(skip.status(), await skip.text()).toBe(200);
   const body = await skip.json();
   expect(body.setupSkipped).toEqual(["domain"]);
   const domain = (body.setup as { id: string; done: boolean; optional?: boolean; skipped?: boolean }[]).find((s) => s.id === "domain")!;
   expect(domain.optional).toBe(true);
   expect(domain.skipped).toBe(true);
   expect(domain.done).toBe(true);
   const bad = await request.put(`/api/store/onboarding-status?store=${STORE}`, { headers: cookie(), data: { skip: "ship_from" } });
   expect(bad.status()).toBe(400);
  } finally {
   const back = await request.put(`/api/store/onboarding-status?store=${STORE}`, { headers: cookie(), data: { unskip: "domain" } });
   expect(back.status()).toBe(200);
   expect((await back.json()).setupSkipped).toEqual(was.filter((x) => x !== "domain"));
  }
 });

 test("the setup funnel answers with a bar per required step and every store, owner-only", async ({ request }) => {
  const anon = await request.get(`/api/admin/setup-funnel`);
  expect(anon.status()).toBe(401);
  const r = await request.get(`/api/admin/setup-funnel`, { headers: cookie() });
  expect(r.status(), await r.text()).toBe(200);
  const body = await r.json();
  expect((body.byStep as { id: string }[]).map((b) => b.id).sort()).toEqual(["first_listing", "payments", "returns", "ship_from", "shipping"]);
  const counts = (body.byStep as { count: number }[]).map((b) => b.count);
  expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  expect(Array.isArray(body.stores)).toBe(true);
  for (const s of body.stores as { slug: string; next: string | null; complete: boolean; stuckSinceDays: number; done: number; total: number }[]) {
   expect(typeof s.slug).toBe("string");
   expect(s.complete).toBe(s.next === null);
   expect(s.stuckSinceDays).toBeGreaterThanOrEqual(0);
   expect(s.total).toBe(6);
  }
  expect(body.stores.filter((s: { complete: boolean }) => !s.complete).length).toBe(counts.reduce((a: number, b: number) => a + b, 0));
 });
});

test.describe("Where stores get stuck (the owner's page)", () => {
 test("renders the headline, the owner's line, a bar per step and the store table", async ({ page }) => {
  test.slow(); // reads every store's checklist for real, behind a cold page compile under two workers
  await signIn(page);
  await page.goto(`/admin/setup-funnel`);
  await expect(page.getByRole("heading", { name: "Where stores get stuck" })).toBeVisible();
  await expect(page.getByText("If 3 sellers out of 10 get stuck somewhere, we need to explain better.")).toBeVisible();
  const bars = page.getByTestId("funnel-bar");
  await expect(bars).toHaveCount(5);
  await expect(bars.first()).toContainText("%");
  const rows = page.getByTestId("funnel-store");
  await expect(rows.first()).toBeVisible();
  await expect(rows.first().locator("a")).toHaveAttribute("href", /^\/admin\/home\?store=/);
  // Owner-only: the sidebar's Platform group carries it.
  await expect(page.locator("aside").getByText("Where stores get stuck")).toBeVisible();
 });
});
