import { test, expect, type Page } from "playwright/test";
import { createHash } from "node:crypto";

// Shopper-facing parity across the renderers: what a piece says on the classic product page it
// says on the hosted (captured-theme) page too, and a hold the seller places badges the tile on the
// Studio/blocks homepage the way it badges the Shop grid.
//
// Both run for real on the throwaway store: a draft is created, published, held where needed, and
// put back (released → removed → deleted) in `finally`. Publishing needs a ship-from address (the
// store has none, and the publish routes refuse without one), so each test lends the store an
// address for its duration and puts back whatever was there. Nothing else is written.

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

type Req = Parameters<Parameters<typeof test>[2]>[0]["request"];

const E2E_SHIP_FROM = { name: "E2E parity", street1: "1 Test Street", city: "Testville", state: "CA", zip: "94000", country: "US" };
type ShipFrom = Record<string, string | null> | null;
const complete = (f: ShipFrom) => !!f && ["street1", "city", "state", "zip", "country"].every((k) => typeof f[k] === "string" && f[k]);

/** Lend the store a ship-from address for the test; returns how to put it back. */
async function lendShipFrom(request: Req): Promise<() => Promise<void>> {
 const before = await request.get(`/api/store/shipping?store=${STORE}`, { headers: cookie() });
 expect(before.status()).toBe(200);
 const was = ((await before.json()).shipFrom ?? null) as ShipFrom;
 if (complete(was)) return async () => {};
 const set = await request.post(`/api/store/shipping?store=${STORE}`, { headers: cookie(), data: { shipFrom: E2E_SHIP_FROM } });
 expect(set.status(), await set.text()).toBe(200);
 return async () => {
  const back = await request.post(`/api/store/shipping?store=${STORE}`, { headers: cookie(), data: { shipFrom: was } });
  expect(back.status(), await back.text()).toBe(200);
 };
}

/** Put a published throwaway back: release any hold, remove, then delete for good. Each step is
 *  best-effort so one failure never leaves the next undone. */
async function cleanUp(request: Req, id: string) {
 await request.post(`/api/store/items/${id}?store=${STORE}`, { headers: cookie(), data: { action: "release" } }).catch(() => null);
 await request.post(`/api/store/items/${id}?store=${STORE}`, { headers: cookie(), data: { action: "remove" } }).catch(() => null);
 const gone = await request.delete(`/api/store/items/${id}?store=${STORE}`, { headers: cookie() });
 expect(gone.status(), await gone.text()).toBe(200);
}

test.describe("The same piece, every renderer", () => {
 test("flaws, grade, note and measurements print on the classic page and on the hosted product page", async ({ page, request }) => {
  const sf = await request.get(`/api/store/storefront?store=${STORE}`, { headers: cookie() });
  expect(sf.status()).toBe(200);
  const handle = ((await sf.json()).settings?.handle ?? STORE) as string;

  const created = await request.post(`/api/store/intake/publish?store=${STORE}`, {
   headers: cookie(),
   data: {
    title: "E2E parity coat", price: 140, category: "coats-jackets", status: "draft", size: "IT 44",
    condition: "Very good", conditionNote: "light wear at the cuffs", flaws: ["small mark inside collar", "one loose button"],
    measurements: [{ key: "pitToPit", value: 52 }, { key: "length", value: 80 }], weightOz: 50,
   },
  });
  expect(created.status(), await created.text()).toBe(200);
  const id = (await created.json()).itemId as string;
  const giveBack = await lendShipFrom(request);
  try {
   const published = await request.post(`/api/store/items/${id}?store=${STORE}`, { headers: cookie(), data: { action: "publish" } });
   expect(published.status(), await published.text()).toBe(200);
   expect((await published.json()).item.status).toBe("active");

   // The classic page — the words every other renderer must match.
   await signIn(page);
   const res = await page.goto(`/s/${handle}/p/${id}?preview=1`);
   test.skip(res?.status() === 404, "the test store has no storefront to render a product page on");
   await expect(page.getByTestId("flaws")).toContainText("small mark inside collar");
   await expect(page.getByTestId("flaws")).toContainText("one loose button");
   // The grade's meaning and the note print when the store's page shows Condition (a per-store
   // fact setting — storefront-product-page.ts); the flaws print either way.
   if (await page.locator("p", { hasText: /^Condition$/ }).count()) {
    await expect(page.getByTestId("condition-definition")).toContainText("Light, honest wear");
    await expect(page.getByTestId("condition-note")).toContainText("light wear at the cuffs");
   }
   await expect(page.getByTestId("measurements")).toContainText("Pit to pit 52");
   await expect(page.getByTestId("measurements")).toContainText("Length 80");

   // The hosted page, in the store's own theme. A store with no capture has no such page; the
   // injection is then proved by app/lib/hosted-product-details.test.ts instead.
   const hosted = await request.get(`/site/${STORE}/products/${id}`);
   test.skip(hosted.status() === 404, `${STORE} has no hosted site on this server — hosted assertion covered by the unit tests`);
   expect(hosted.status(), await hosted.text()).toBe(200);
   const html = await hosted.text();
   expect(html).toContain("data-vya-details");
   expect(html.split("data-vya-details=").length - 1, "one block, never two").toBe(1);
   const block = html.slice(html.indexOf("<section data-vya-details"), html.indexOf("</section>", html.indexOf("<section data-vya-details")));
   expect(block).toContain("small mark inside collar");
   expect(block).toContain("one loose button");
   expect(block).toContain("Pit to pit 52");
   expect(block).toContain("Length 80");
   expect(block).toContain("Light, honest wear");
   expect(block).toContain("Condition note: light wear at the cuffs");
  } finally {
   await cleanUp(request, id);
   await giveBack();
  }
 });

 test("a held piece is badged On hold on the Studio/blocks homepage, with data-vya-held, and still links to its page", async ({ page, request }) => {
  const sf = await request.get(`/api/store/storefront?store=${STORE}`, { headers: cookie() });
  expect(sf.status()).toBe(200);
  const settings = (await sf.json()).settings ?? {};
  const handle = (settings.handle ?? STORE) as string;
  const blocks = (settings.theme?.blocks ?? []) as { type?: string; props?: Record<string, string> }[];
  const featured = blocks.find((b) => b.type === "featured" || b.type === "products");
  test.skip(!featured, "the test store's homepage has no product section (Studio/blocks) to badge a tile in");
  test.skip(!!featured?.props?.collection, "the store's product section names a collection, so a new piece would not appear in it");

  const title = `E2E held tile ${Date.now().toString(36)}`;
  const created = await request.post(`/api/store/intake/publish?store=${STORE}`, { headers: cookie(), data: { title, price: 95, category: "bags", status: "draft" } });
  expect(created.status(), await created.text()).toBe(200);
  const id = (await created.json()).itemId as string;
  const giveBack = await lendShipFrom(request);
  try {
   const published = await request.post(`/api/store/items/${id}?store=${STORE}`, { headers: cookie(), data: { action: "publish" } });
   expect(published.status(), await published.text()).toBe(200);
   const hold = await request.post(`/api/store/items/${id}?store=${STORE}`, { headers: cookie(), data: { action: "hold", name: "E2E Ana", days: 1 } });
   expect(hold.status(), await hold.text()).toBe(200);
   expect((await hold.json()).item.status).toBe("reserved");

   await signIn(page);
   const res = await page.goto(`/s/${handle}?preview=1`);
   test.skip(res?.status() === 404, "the test store has no storefront to render a homepage on");
   const section = page.locator(".vya-featured, .vya-products").first();
   test.skip((await section.count()) === 0, "no product section rendered on the homepage");
   const tile = section.locator("a.group", { hasText: title }).first();
   await expect(tile).toBeVisible();
   await expect(tile.locator("[data-vya-held]")).toHaveText(/on hold/i);
   await expect(tile).not.toContainText(/^Sold$/);
   // Same href shape as the classic grid: the product page, which refuses the sale itself.
   expect(await tile.getAttribute("href")).toContain(`/p/${id}`);
  } finally {
   await cleanUp(request, id);
   await giveBack();
  }
 });
});
