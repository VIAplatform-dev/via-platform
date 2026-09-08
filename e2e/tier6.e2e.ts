import { test, expect, type Page } from "playwright/test";
import { createHash } from "node:crypto";

// Tier 6 — online selling and shipping, as the owner sees it: a piece carries its measurements,
// its grade and where it ships on the storefront; an unweighed coat is no longer quoted as a small
// parcel; three pieces bought together are one row, one label, one Mark posted; and the shipping
// prices she sets are in her own currency with VYA's shown greyed behind them.
//
// The product page is server-rendered, so it is proved on a real throwaway item on the throwaway
// store, deleted in `finally`. Orders, Settings and Add a piece run on fixtures (route interception)
// so the numbers are exact and nothing is written.

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

const TIERS = [
 { id: "small", label: "Small", priceCents: 800, examples: "" },
 { id: "medium", label: "Medium", priceCents: 1400, examples: "" },
 { id: "large", label: "Large", priceCents: 2400, examples: "" },
];

test.describe("A piece · sizing and condition as structure, and where it ships (#31, #32, #27)", () => {
 test("measurements, the grade and Ships to print on the storefront; an unweighed coat ships as a large parcel", async ({ page, request }) => {
  const sf = await request.get(`/api/store/storefront?store=${STORE}`, { headers: cookie() });
  expect(sf.status()).toBe(200);
  const handle = ((await sf.json()).settings?.handle ?? STORE) as string;

  const created = await request.post(`/api/store/intake/publish?store=${STORE}`, {
   headers: cookie(),
   data: {
    title: "E2E structured coat", price: 120, category: "coats-jackets", status: "draft", size: "IT 44",
    condition: "Very good", conditionNote: "light wear at the cuffs", flaws: ["small mark inside collar"],
    measurements: [{ key: "pitToPit", value: 52 }, { key: "length", value: 80 }, { key: "shoulder", value: "" }],
    weightOz: 50,
   },
  });
  expect(created.status(), await created.text()).toBe(200);
  const id = (await created.json()).itemId as string;
  // The same coat with no weight typed and no AI parcel: the category fills it, and it is LARGE.
  const unweighed = await request.post(`/api/store/intake/publish?store=${STORE}`, {
   headers: cookie(), data: { title: "E2E unweighed coat", price: 90, category: "coats-jackets", status: "draft" },
  });
  expect(unweighed.status(), await unweighed.text()).toBe(200);
  const id2 = (await unweighed.json()).itemId as string;
  try {
   const items = await request.get(`/api/store/items?store=${STORE}`, { headers: cookie() });
   type Row = { id: string; condition: string | null; conditionNote?: string | null; measurementsJson?: { key: string; value: number; unit: string }[] | null; weightOz: number | null; parcelEstimate?: { tier: string; source: string } | null; flaws?: string[] };
   const all = (await items.json()).items as Row[];
   const mine = all.find((i) => i.id === id)!;
   expect(mine.condition).toBe("Very good");
   expect(mine.conditionNote).toBe("light wear at the cuffs");
   expect(mine.flaws).toEqual(["small mark inside collar"]);
   // The blank shoulder is omitted, not stored as zero; the unit is the store's.
   expect(mine.measurementsJson?.map((m) => [m.key, m.value])).toEqual([["pitToPit", 52], ["length", 80]]);
   expect(["cm", "in"]).toContain(mine.measurementsJson?.[0].unit);
   expect(mine.weightOz).toBe(50);
   const coat = all.find((i) => i.id === id2)!;
   expect(coat.weightOz).toBe(52);
   expect(coat.parcelEstimate).toMatchObject({ tier: "large", source: "category" });

   // An edit with a list replaces it; a note travels with the grade.
   const patched = await request.patch(`/api/store/items/${id}?store=${STORE}`, { headers: cookie(), data: { measurements: [{ key: "pitToPit", value: 53.26 }], conditionNote: "light wear at the cuffs, one loose button" } });
   expect(patched.status(), await patched.text()).toBe(200);
   const after = (await patched.json()).item as Row;
   expect(after.measurementsJson?.map((m) => [m.key, m.value])).toEqual([["pitToPit", 53.3]]);

   await signIn(page);
   const res = await page.goto(`/s/${handle}/p/${id}?preview=1`);
   test.skip(res?.status() === 404, "the test store has no storefront to render a product page on");
   const measurements = page.getByTestId("measurements");
   await expect(measurements).toBeVisible();
   await expect(measurements).toContainText("Measurements");
   await expect(measurements.locator("li")).toHaveCount(1);
   await expect(measurements.locator("li").first()).toContainText(/Pit to pit 53\.3( cm|")/);
   // Under Size: the Size fact comes first in the document when the store prints one.
   const sizeLabel = page.locator("p", { hasText: /^Size$/ }).first();
   if (await sizeLabel.count()) {
    const order = await page.evaluate(() => {
     const m = document.querySelector('[data-testid="measurements"]');
     const s = Array.from(document.querySelectorAll("p")).find((p) => p.textContent?.trim() === "Size");
     return m && s ? (s.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 : null;
    });
    expect(order).not.toBe(false);
    // The tag and what it means: an IT 44 is about a US 8.
    await expect(page.getByText("Marked IT 44 · about a US 8")).toBeVisible();
   }
   // The grade's definition prints when the store shows Condition; the flaws list sits under it.
   const condition = page.locator("p", { hasText: /^Condition$/ }).first();
   if (await condition.count()) {
    await expect(page.getByTestId("condition-definition")).toContainText("Light, honest wear");
    await expect(page.getByTestId("condition-extra")).toContainText("one loose button");
   }
   await expect(page.getByTestId("flaws").locator("li")).toHaveCount(1);
   // Ships to: only once the store has saved shipping at all — otherwise the page says nothing.
   const setup = await request.get(`/api/store/onboarding-status?store=${STORE}`, { headers: cookie() });
   const shippingOn = ((await setup.json()).setup as { id: string; done: boolean }[]).find((s) => s.id === "shipping")?.done === true;
   const shipsTo = page.getByTestId("ships-to");
   if (shippingOn) {
    await expect(shipsTo).toBeVisible();
    await expect(shipsTo).toContainText("Ships to");
    await expect(shipsTo).toContainText(/only|and|Worldwide/);
    // The from-price is in the piece's currency, never a bare number of cents.
    const from = page.getByTestId("shipping-from");
    if (await from.count()) await expect(from).toContainText(/Free shipping|Shipping from [^\d\s]/);
   } else {
    await expect(shipsTo).toHaveCount(0);
   }
  } finally {
   for (const x of [id, id2]) {
    const gone = await request.delete(`/api/store/items/${x}?store=${STORE}`, { headers: cookie() });
    expect(gone.status(), await gone.text()).toBe(200);
   }
  }
 });

 test("Add a piece has a Flaws list, condition chips with their meaning, the category's measurements and Ships as", async ({ page }) => {
  await signIn(page);
  await page.route(/\/api\/store\/shipping(\?.*)?$/, (r) => r.fulfill({ json: { currency: "GBP", mode: "buyer_pays", freeThresholdUsd: null, shipFrom: { country: "GB" }, zones: { domestic: { enabled: true } }, tiers: TIERS, dutyMode: "buyer_pays", effectiveDutyMode: "buyer_pays", dutyDowngraded: false, carrierConnected: false } }));
  await page.goto(`/admin/add-listing?store=${STORE}`);
  const flaws = page.getByTestId("flaws-editor");
  await expect(flaws).toBeVisible();
  const box = flaws.locator("input");
  await box.fill("light pilling at cuffs");
  await box.press("Enter");
  await expect(flaws.locator("li")).toHaveCount(1);
  await expect(flaws.locator("li").first()).toContainText("light pilling at cuffs");
  await expect(box).toHaveValue("");
  await flaws.getByRole("button", { name: "Remove flaw: light pilling at cuffs" }).click();
  await expect(flaws.locator("li")).toHaveCount(0);

  const chips = page.getByTestId("condition-chips");
  await expect(chips).toBeVisible();
  for (const g of ["Mint", "Excellent", "Very good", "Good", "Fair"]) await expect(chips.getByRole("button", { name: g, exact: true })).toBeVisible();
  await chips.getByRole("button", { name: "Very good", exact: true }).click();
  await expect(chips).toContainText("Light, honest wear");
  await expect(chips.getByRole("button", { name: "Very good", exact: true })).toHaveAttribute("aria-pressed", "true");

  // No category yet → the generic pair, in the store's unit (a GB ship-from measures in cm).
  const fields = page.getByTestId("measurement-fields");
  await expect(fields).toBeVisible();
  await expect(fields).toContainText("centimetres");
  await expect(fields.getByLabel("Length")).toBeVisible();
  await expect(fields.getByLabel("Width")).toBeVisible();

  // Ships as: the tier from her weight, and a warning when it disagrees with the estimate.
  const ships = page.getByTestId("ships-as");
  await expect(ships).toBeVisible();
  await expect(ships).toContainText("Medium parcel");
  await ships.getByLabel("Weight (oz)").fill("8");
  await expect(ships).toContainText("Small parcel · 8 oz");
  await expect(page.getByTestId("parcel-mismatch")).toContainText("Buyers get quoted the small tier and you pay the difference.");
  await ships.getByLabel("Weight (oz)").fill("20");
  await expect(page.getByTestId("parcel-mismatch")).toHaveCount(0);
 });
});

test.describe("Orders · parcels, not pieces (#28)", () => {
 const order = (id: string, p: Partial<{ status: string; paymentIntent: string | null; deliveryMethod: "ship" | "pickup"; itemTitle: string; labelUrl: string | null }> = {}) => ({
  id, orderNo: Number(id.replace(/\D/g, "")) || 1, itemTitle: p.itemTitle ?? `Piece ${id}`, amountCents: 4000, taxCents: null, currency: "GBP",
  buyerEmail: "ana@example.com", status: p.status ?? "paid", paidAt: "2026-09-07T10:00:00.000Z", deliveryMethod: p.deliveryMethod ?? "ship",
  paymentIntent: p.paymentIntent === undefined ? `pi_${id}` : p.paymentIntent, labelUrl: p.labelUrl ?? null, trackingNumber: null, trackingUrl: null,
 });
 const ORDERS = [
  order("o1", { paymentIntent: "pi_bag", itemTitle: "Silk blouse", labelUrl: "https://labels.example/bag.pdf" }),
  order("o2", { paymentIntent: "pi_bag", itemTitle: "Wool skirt" }),
  order("o3", { paymentIntent: "pi_bag", itemTitle: "Leather belt" }),
  order("o4", { paymentIntent: "pi_solo", itemTitle: "Trench coat", status: "shipped" }),
  order("o5", { paymentIntent: "pi_collect", itemTitle: "Beret", deliveryMethod: "pickup" }),
 ];

 test("three pieces bought together are one row with one Print label and one Mark posted that sends every id", async ({ page }) => {
  await signIn(page);
  await page.route(/\/api\/store\/orders(\?.*)?$/, (r) => r.fulfill({ json: { ok: true, orders: ORDERS, imported: [] } }));
  let posted: { orderIds: string[]; action: string } | null = null;
  await page.route(/\/api\/store\/orders\/parcel(\?.*)?$/, (r) => { posted = r.request().postDataJSON(); r.fulfill({ json: { ok: true, status: "shipped", changed: ["o1", "o2", "o3"], email: "sent" } }); });
  await page.goto(`/admin/orders?store=${STORE}`);
  const rows = page.getByTestId("parcel-row");
  await expect(rows).toHaveCount(3);
  const bag = rows.filter({ hasText: "3 pieces · one parcel" });
  await expect(bag).toHaveCount(1);
  await expect(bag).toHaveAttribute("data-pieces", "3");
  await expect(bag.locator("li")).toHaveCount(3);
  await expect(bag).toContainText("Silk blouse");
  await expect(bag).toContainText("Leather belt");
  await expect(bag.getByRole("button", { name: "Mark posted" })).toHaveCount(1);
  await expect(bag.getByRole("link", { name: "Print label" })).toHaveAttribute("href", "https://labels.example/bag.pdf");
  // The amount is the bag's, in the store's currency.
  await expect(bag).toContainText("£120");
  // The stat counts bags going by post: the collection and the shipped coat are not on her table.
  await expect(page.getByText("Parcels to post").locator("..")).toContainText("1");
  await expect(rows.filter({ hasText: "Beret" }).getByRole("button", { name: "Mark collected" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Trench coat" }).getByRole("button", { name: "Mark delivered" })).toHaveCount(1);

  await bag.getByRole("button", { name: "Mark posted" }).click();
  await expect.poll(() => posted).not.toBeNull();
  expect(posted!.action).toBe("posted");
  expect(posted!.orderIds.sort()).toEqual(["o1", "o2", "o3"]);
 });

 test("Home's tile counts parcels to post, not pieces", async ({ page }) => {
  await signIn(page);
  await page.route(/\/api\/store\/orders(\?.*)?$/, (r) => r.fulfill({ json: { ok: true, orders: ORDERS, imported: [] } }));
  await page.goto(`/admin/home?store=${STORE}`);
  const tile = page.locator("a", { hasText: "Parcels to post" }).first();
  await expect(tile).toBeVisible();
  await expect(tile).toContainText("1");
  await expect(page.getByText("Orders to ship")).toHaveCount(0);
 });
});

test.describe("Settings › Shipping · her own prices, in her currency (#26)", () => {
 test("VYA's defaults sit greyed behind her prices, the symbol is the store's, and a row can reset", async ({ page }) => {
  await signIn(page);
  let saved: { zones?: Record<string, { enabled: boolean; rates?: Record<string, number> }> } | null = null;
  await page.route(/\/api\/store\/shipping\/carrier(\?.*)?$/, (r) => r.fulfill({ json: { carriers: [], configured: true } }));
  await page.route(/\/api\/store\/shipping(\?.*)?$/, (r) => {
   if (r.request().method() === "POST") { saved = r.request().postDataJSON(); return r.fulfill({ json: { ok: true, effectiveDutyMode: "buyer_pays", dutyDowngraded: false } }); }
   return r.fulfill({ json: {
    currency: "GBP", mode: "buyer_pays", freeThresholdUsd: null, shipFrom: { country: "GB" }, pickup: null, pickupOffered: false,
    dutyMode: "buyer_pays", effectiveDutyMode: "buyer_pays", dutyDowngraded: false, carrierConnected: false,
    zones: { domestic: { enabled: true, rates: { medium: 450, small: 0 } }, europe: { enabled: true }, north_america: { enabled: false }, rest_of_world: { enabled: false } },
    tiers: TIERS,
   } });
  });
  await page.goto(`/admin/settings/shipping?store=${STORE}`);
  const table = page.getByTestId("tier-prices");
  await expect(table).toBeVisible();
  await expect(table).toContainText("in GBP");
  const home = page.getByTestId("tier-prices-domestic");
  await expect(home).toBeVisible();
  await expect(home).toContainText("£");
  await expect(home).not.toContainText("$");
  // Her prices where she set them (zero included — free small parcels), VYA's greyed where she didn't.
  await expect(home.getByLabel("Your own country Small price")).toHaveValue("0");
  await expect(home.getByLabel("Your own country Medium price")).toHaveValue("4.5");
  await expect(home.getByLabel("Your own country Large price")).toHaveValue("");
  await expect(home.getByLabel("Your own country Large price")).toHaveAttribute("placeholder", "24");
  await expect(home.getByLabel("Your own country Small price")).toHaveAttribute("placeholder", "8");
  // Only the zones she serves get a row.
  await expect(page.getByTestId("tier-prices-europe")).toBeVisible();
  await expect(page.getByTestId("tier-prices-north_america")).toHaveCount(0);
  await expect(page.getByTestId("tier-prices-europe").getByLabel("Europe Medium price")).toHaveAttribute("placeholder", "14");
  // Reset clears the row's overrides — the save carries no rates for home.
  await expect(page.getByTestId("tier-prices-europe").getByRole("button", { name: "Reset to VYA’s" })).toHaveCount(0);
  await home.getByRole("button", { name: "Reset to VYA’s" }).click();
  await expect.poll(() => saved).not.toBeNull();
  expect(saved!.zones?.domestic).toEqual({ enabled: true });
  await expect(home.getByLabel("Your own country Medium price")).toHaveValue("");
 });
});
