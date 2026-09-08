import { test, expect, type Page } from "playwright/test";
import { createHash } from "node:crypto";

// Surface parity, as the owner sees it: a hold she places is a hold EVERYWHERE — the ⌘K search
// says "on hold", the storefront keeps the piece on the shelf with an "On hold" badge, the web
// Inventory pill names the customer and offers Release — and Settings › Notifications shows the
// same seven switches the phone does and writes one key per flip.
//
// The hold runs for real on the throwaway store and is released in `finally`. Inventory and
// Settings run on fixtures (route interception) so the words are exact and nothing else is written.

const STORE = process.env.E2E_STORE || "gfdgsgfsgdfs";
const adminToken = () => {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) throw new Error("ADMIN_PASSWORD is required to sign in as the workspace admin");
 return createHash("sha256").update(pw).digest("hex");
};
const cookie = () => ({ Cookie: `via_admin_token=${adminToken()}` });

async function signIn(page: Page) {
 // The base the config runs against (playwright.config.ts) — read from the environment rather
 // than the context's private `_options`, which the older specs reach into and tsc dislikes.
 const base = new URL(process.env.E2E_BASE || "http://localhost:3001");
 await page.context().addCookies([{ name: "via_admin_token", value: adminToken(), domain: base.hostname, path: "/" }]);
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const item = (id: string, title: string, status = "active") => ({
 id, sku: 1, title, priceCents: 12_000, costCents: null, currency: "USD", images: [], brand: null, era: null, material: null, colour: null,
 condition: null, size: null, category: null, description: null, status, weightOz: null, lengthIn: null, widthIn: null, heightIn: null,
 collections: [], createdAt: daysAgo(3),
});
const ITEMS = [item("i-live", "Green Fendi cardigan"), item("i-held", "Held silk skirt", "reserved"), item("i-checkout", "Buyer's boots", "reserved")];
const in3d = new Date(Date.now() + 3 * 86_400_000 + 3_600_000).toISOString();
const HOLDS = {
 holds: [{ itemId: "i-held", name: "Ana", expiresAt: in3d, title: "Held silk skirt", image: null, priceCents: 12_000, currency: "USD" }],
 today: [],
 thisWeek: [{ itemId: "i-held", name: "Ana", expiresAt: in3d, title: "Held silk skirt", image: null, priceCents: 12_000, currency: "USD" }],
};

test.describe("Holds, everywhere (#2, #3, #15)", () => {
 test("hold a live piece: search says on hold, the storefront shelf keeps it badged, release puts it back", async ({ page, request }) => {
  const list = await request.get(`/api/store/items?store=${STORE}`, { headers: cookie() });
  expect(list.status()).toBe(200);
  const live = ((await list.json()).items as { id: string; status: string; title: string }[]).find((i) => i.status === "active");
  test.skip(!live, "the test store has no live piece to hold");
  const id = live!.id;
  try {
   const hold = await request.post(`/api/store/items/${id}?store=${STORE}`, { headers: cookie(), data: { action: "hold", name: "E2E Ana", days: 2 } });
   expect(hold.status(), await hold.text()).toBe(200);
   expect((await hold.json()).item.status).toBe("reserved");

   // ⌘K: the held piece's sub line says "on hold", never "reserved".
   const q = live!.title.split(/\s+/).slice(0, 2).join(" ");
   const search = await request.get(`/api/store/search?q=${encodeURIComponent(q)}&store=${STORE}`, { headers: cookie() });
   expect(search.status()).toBe(200);
   const groups = (await search.json()).groups as { group: string; hits: { id: string; sub: string }[] }[];
   const hit = groups.find((g) => g.group === "Inventory")?.hits.find((h) => h.id === id);
   expect(hit, `search found the held piece for "${q}"`).toBeTruthy();
   expect(hit!.sub).toMatch(/on hold$/);
   expect(hit!.sub).not.toMatch(/reserved/);

   // The storefront shelf: still there, badged "On hold", not "Sold".
   const sf = await request.get(`/api/store/storefront?store=${STORE}`, { headers: cookie() });
   const handle = ((await sf.json()).settings?.handle ?? STORE) as string;
   await signIn(page);
   const res = await page.goto(`/s/${handle}/shop?preview=1`);
   test.skip(res?.status() === 404, "the test store has no storefront to render a shelf on");
   const card = page.locator("a.group", { hasText: live!.title }).first();
   await expect(card).toBeVisible();
   await expect(card.locator("[data-vya-held]")).toHaveText(/on hold/i);
   await expect(card).not.toContainText(/^Sold$/);
  } finally {
   const release = await request.post(`/api/store/items/${id}?store=${STORE}`, { headers: cookie(), data: { action: "release" } });
   expect(release.status(), await release.text()).toBe(200);
   expect((await release.json()).item.status).toBe("active");
  }
 });

 test("web Inventory: a held piece reads On hold · Ana with Release; a buyer's reservation stays Reserved; a live one offers Hold", async ({ page }) => {
  await signIn(page);
  await page.route(/\/api\/store\/items(\?.*)?$/, (r) => r.fulfill({ json: { ok: true, items: ITEMS, isAdmin: true } }));
  await page.route(/\/api\/store\/holds/, (r) => r.fulfill({ json: HOLDS }));
  await page.goto(`/admin/inventory?store=${STORE}`);
  const table = page.locator("table").first();
  const heldRow = table.locator("tbody tr", { hasText: "Held silk skirt" });
  await expect(heldRow).toContainText("On hold · Ana");
  await expect(heldRow).toContainText(/days left/);
  await expect(heldRow.getByRole("button", { name: "Release hold" })).toBeVisible();
  const checkoutRow = table.locator("tbody tr", { hasText: "Buyer's boots" });
  await expect(checkoutRow).toContainText("Reserved");
  await expect(checkoutRow).not.toContainText("On hold");
  await expect(checkoutRow.getByRole("button", { name: "Release hold" })).toHaveCount(0);
  const liveRow = table.locator("tbody tr", { hasText: "Green Fendi cardigan" });
  await liveRow.getByRole("button", { name: "Hold", exact: true }).click();
  const dialog = page.getByTestId("hold-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Tonight" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "2 weeks" })).toBeVisible();
 });
});

test.describe("Settings › Notifications (#7)", () => {
 test("renders the phone's seven switches from the store's prefs and PUTs one key per flip", async ({ page }) => {
  await signIn(page);
  const prefs = { push: { sold: true, message: true, offer: false, payout: false }, email: { daily: false, weekly: true, needs: true } };
  const puts: unknown[] = [];
  await page.route(/\/api\/store\/notification-prefs(\?.*)?$/, async (r) => {
   if (r.request().method() === "PUT") {
    const body = r.request().postDataJSON();
    puts.push(body);
    const next = { push: { ...prefs.push, ...(body.push || {}) }, email: { ...prefs.email, ...(body.email || {}) } };
    await r.fulfill({ json: { ok: true, prefs: next } });
    return;
   }
   await r.fulfill({ json: { ok: true, prefs } });
  });
  await page.goto(`/admin/settings/notifications?store=${STORE}`);
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(page.getByText("A piece sells")).toBeVisible();
  await expect(page.getByText("Weekly numbers")).toBeVisible();
  await expect(page.getByTestId("pref-push-sold").getByRole("button")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("pref-push-offer").getByRole("button")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText(/needs the app installed/i)).toBeVisible();

  await page.getByTestId("pref-push-offer").getByRole("button").click();
  await expect(page.getByTestId("pref-push-offer").getByRole("button")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Saved.")).toBeVisible();
  expect(puts).toEqual([{ push: { offer: true } }]);
  // The rail lists it under Store, so it can be found.
  await expect(page.getByRole("link", { name: "Notifications" }).first()).toBeVisible();
 });
});

test.describe("The bag · a held piece cannot be bought", () => {
 test("adding a held piece to the bag is refused with the on-hold wording, and released after", async ({ request }) => {
  const list = await request.get(`/api/store/items?store=${STORE}`, { headers: cookie() });
  const live = ((await list.json()).items as { id: string; status: string }[]).find((i) => i.status === "active");
  test.skip(!live, "the test store has no live piece to hold");
  const id = live!.id;
  try {
   const hold = await request.post(`/api/store/items/${id}?store=${STORE}`, { headers: cookie(), data: { action: "hold", name: "E2E Ana", days: 1 } });
   expect(hold.status(), await hold.text()).toBe(200);
   // The shopper's bag, no admin cookie: the piece is on hold, so it is refused.
   const bag = await request.post(`/api/storefront/cart`, { data: { itemId: id } });
   expect(bag.status()).toBe(409);
   expect((await bag.json()).error).toMatch(/on hold/i);
  } finally {
   const release = await request.post(`/api/store/items/${id}?store=${STORE}`, { headers: cookie(), data: { action: "release" } });
   expect(release.status()).toBe(200);
  }
 });
});
