import { test, expect, type Page, type APIRequestContext } from "playwright/test";
import { createHash } from "node:crypto";

// Tier 3, as the owner sees it: a "Set up your store" card on Home until the store can take a
// sale, one row per thing that needs her (from /api/store/attention), a sidebar that says what
// she would say, and the two new routes answering for real.
//
// Home and the sidebar run on fixtures (route interception) so the numbers are exact. The real
// routes are read, and the notification-prefs round trip puts back what it changed.

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

const SETUP = [
 { id: "ship_from", label: "Add the address you ship from", hint: "Needed before a listing can go live", href: "/admin/settings/locations", done: true },
 { id: "payments", label: "Finish Stripe setup", hint: "Stripe still needs a few details", href: "/admin/settings/payments", done: false },
 { id: "shipping", label: "Switch shipping on", href: "/admin/settings/shipping", done: false },
 { id: "first_listing", label: "List your first piece", href: "/admin/add-listing", done: true },
 { id: "returns", label: "Set your returns policy", href: "/admin/settings/general", done: false },
 { id: "domain", label: "Connect your own domain", hint: "Optional — your VYA address works today", href: "/admin/settings/domain", done: false, optional: true },
];
const ONBOARDING = (complete: boolean) => ({
 ok: true, onboarded: true, shipFromSet: true, storeName: "Test store",
 setup: complete ? SETUP.map((s) => ({ ...s, done: !s.optional })) : SETUP,
 setupComplete: complete, setupDone: complete ? 5 : 2, setupTotal: 6, setupNext: complete ? null : "payments",
});
const ATTENTION = {
 counts: { noPhoto: 3, unpriced: 0, lowConfidence: 0, costMissing: 0, holdsToday: 0, pickupsWaiting: 0, unanswered24h: 2, payoutsDue: 0, crossListingFailed: 1, over90: 0, over60: 0 },
 rows: [
  { id: "noPhoto", label: "3 pieces without a photo", count: 3, href: "/admin/inventory?missing=photo", urgent: true },
  { id: "unanswered24h", label: "2 messages waiting over a day", count: 2, href: "/admin/inbox", urgent: true },
  { id: "crossListingFailed", label: "1 piece failed to post", count: 1, href: "/admin/cross-listing", urgent: true },
 ],
 lowConfidenceIds: [],
};

async function mockHome(page: Page, complete: boolean) {
 await page.route(/\/api\/store\/onboarding-status/, (r) => r.fulfill({ json: ONBOARDING(complete) }));
 await page.route(/\/api\/store\/attention/, (r) => r.fulfill({ json: ATTENTION }));
 await page.route(/\/api\/store\/items(\?.*)?$/, (r) => r.fulfill({ json: { ok: true, items: [], isAdmin: true } }));
 await page.route(/\/api\/store\/holds/, (r) => r.fulfill({ json: { holds: [], today: [], thisWeek: [] } }));
}

test.describe("Home · set up your store", () => {
 test("the card leads with the next step (option B) and shows the ring and every row (option F)", async ({ page }) => {
  await signIn(page);
  await mockHome(page, false);
  await page.goto(`/admin/home?store=${STORE}`);
  const card = page.getByTestId("setup-card");
  await expect(card).toBeVisible();
  // Left: the next step as the headline, the count, the hint with its time cue, one button with the verb.
  await expect(card.getByTestId("setup-eyebrow")).toHaveText("Next · 4 to go");
  await expect(card.getByTestId("setup-headline")).toHaveText("Finish Stripe setup");
  await expect(card).toContainText("Stripe still needs a few details. About five minutes.");
  const button = card.getByTestId("setup-next");
  await expect(button).toHaveText("Finish Stripe setup");
  await expect(button).toHaveAttribute("href", "/admin/settings/payments");
  await expect(card.getByTestId("setup-then")).toHaveText("then Shipping · Returns · Domain");
  // Right: the ring, the title, the count, and one row per step in the checklist's order.
  await expect(card.getByTestId("setup-ring")).toHaveText("2/6");
  await expect(card).toContainText("Set up your store");
  await expect(card).toContainText("4 to go");
  await expect(card.locator("[data-testid^=setup-row-]")).toHaveCount(6);
  const done = card.getByTestId("setup-row-ship_from");
  await expect(done).toHaveAttribute("data-state", "done");
  await expect(done.locator("a")).toHaveClass(/line-through/);
  await expect(card.getByTestId("setup-row-payments")).toHaveAttribute("data-state", "next");
  await expect(card.getByTestId("setup-row-shipping")).toHaveAttribute("data-state", "later");
  const stripe = card.getByTestId("setup-row-payments").locator("a");
  await expect(stripe).toHaveAttribute("href", "/admin/settings/payments");
  const domain = card.getByTestId("setup-row-domain");
  await expect(domain).toHaveAttribute("data-state", "optional");
  await expect(domain.locator("a")).toHaveAttribute("href", "/admin/settings/domain");
  await expect(domain.getByTestId("setup-skip-domain")).toHaveText("skip");
 });

 test("skip on the domain row persists it and takes the row away", async ({ page }) => {
  await signIn(page);
  await mockHome(page, false);
  let putBody: unknown = null;
  await page.route(/\/api\/store\/onboarding-status/, async (r) => {
   if (r.request().method() !== "PUT") return r.fulfill({ json: ONBOARDING(false) });
   putBody = r.request().postDataJSON();
   const skipped = { ...ONBOARDING(false), setup: SETUP.map((s) => (s.id === "domain" ? { ...s, done: true, skipped: true } : s)), setupDone: 3, setupSkipped: ["domain"] };
   return r.fulfill({ json: skipped });
  });
  await page.goto(`/admin/home?store=${STORE}`);
  const card = page.getByTestId("setup-card");
  await card.getByTestId("setup-skip-domain").click();
  await expect.poll(() => putBody).toEqual({ skip: "domain" });
  await expect(card.locator("[data-testid^=setup-row-]")).toHaveCount(5);
  await expect(card.getByTestId("setup-ring")).toHaveText("3/6");
  await expect(card.getByTestId("setup-eyebrow")).toHaveText("Next · 3 to go");
  await expect(card.getByTestId("setup-then")).toHaveText("then Shipping · Returns");
 });

 test("once every required step is done, the card is gone", async ({ page }) => {
  await signIn(page);
  await mockHome(page, true);
  await page.goto(`/admin/home?store=${STORE}`);
  await expect(page.getByText("Live listings")).toBeVisible();
  await expect(page.getByTestId("setup-card")).toHaveCount(0);
 });
});

test.describe("Home · what needs her", () => {
 test("each attention row is a tile with the count and a deep link; a zero row is absent", async ({ page }) => {
  await signIn(page);
  await mockHome(page, true);
  await page.goto(`/admin/home?store=${STORE}`);
  const photos = page.locator("a", { hasText: "3 pieces without a photo" });
  await expect(photos).toBeVisible();
  await expect(photos).toContainText("3");
  await expect(photos).toHaveAttribute("href", /missing=photo/);
  const failed = page.locator("a", { hasText: "1 piece failed to post" });
  await expect(failed).toBeVisible();
  await expect(failed).toHaveAttribute("href", /cross-listing/);
  const msgs = page.locator("a", { hasText: "2 messages waiting over a day" });
  await expect(msgs).toBeVisible();
  await expect(msgs).toHaveAttribute("href", /\/admin\/inbox/);
  await expect(page.getByText(/collections? waiting/)).toHaveCount(0);
 });
});

test.describe("The sidebar", () => {
 test("says Add a piece, Site versions, Abandoned carts — and never Drafts under Storefront or Cart recovery", async ({ page }) => {
  await signIn(page);
  await mockHome(page, true);
  await page.goto(`/admin/storefront/versions?store=${STORE}`);
  const aside = page.locator("aside");
  const add = aside.locator("a", { hasText: "Add a piece" });
  await expect(add).toBeVisible();
  await expect(add).toHaveAttribute("href", "/admin/add-listing");
  await expect(aside.getByText("Site versions")).toBeVisible();
  await expect(aside.getByText("Drafts", { exact: true })).toHaveCount(0);
  await expect(aside.getByText("Cart recovery")).toHaveCount(0);
  await expect(aside.getByText("Bring your site")).toHaveCount(0);

  await page.goto(`/admin/customers/recovery?store=${STORE}`);
  await expect(aside.getByText("Abandoned carts")).toBeVisible();
  await expect(aside.getByText("Cart recovery")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Abandoned carts" })).toBeVisible();
 });
});

test.describe("The real routes", () => {
 test("attention answers with counts and only non-zero rows", async ({ request }) => {
  const r = await request.get(`/api/store/attention?store=${STORE}`, { headers: cookie() });
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(typeof body.counts.noPhoto).toBe("number");
  expect(Array.isArray(body.lowConfidenceIds)).toBe(true);
  for (const row of body.rows as { count: number; href: string; label: string }[]) {
   expect(row.count).toBeGreaterThan(0);
   expect(row.href).toMatch(/^\/admin\//);
   expect(row.label.length).toBeGreaterThan(0);
  }
 });

 test("onboarding-status carries the six setup steps in order", async ({ request }) => {
  const r = await request.get(`/api/store/onboarding-status?store=${STORE}`, { headers: cookie() });
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect((body.setup as { id: string }[]).map((s) => s.id)).toEqual(["ship_from", "payments", "shipping", "first_listing", "returns", "domain"]);
  expect(typeof body.setupComplete).toBe("boolean");
  expect(body.setup[5].optional).toBe(true);
 });

 test("notification prefs round-trip: flip one key, read it back, put it back", async ({ request }: { request: APIRequestContext }) => {
  const before = await request.get(`/api/store/notification-prefs?store=${STORE}`, { headers: cookie() });
  expect(before.status()).toBe(200);
  const was = (await before.json()).prefs.push.payout as boolean;
  try {
   const put = await request.put(`/api/store/notification-prefs?store=${STORE}`, { headers: cookie(), data: { push: { payout: !was } } });
   expect(put.status(), await put.text()).toBe(200);
   expect((await put.json()).prefs.push.payout).toBe(!was);
   // The other keys are untouched by a one-key patch.
   expect((await put.json()).prefs.push.sold).toBe((await before.json()).prefs.push.sold);
   const after = await request.get(`/api/store/notification-prefs?store=${STORE}`, { headers: cookie() });
   expect((await after.json()).prefs.push.payout).toBe(!was);
  } finally {
   const back = await request.put(`/api/store/notification-prefs?store=${STORE}`, { headers: cookie(), data: { push: { payout: was } } });
   expect(back.status()).toBe(200);
   expect((await back.json()).prefs.push.payout).toBe(was);
  }
 });
});
