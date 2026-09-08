import { test, expect, type Page } from "playwright/test";
import { createHash } from "node:crypto";

// The profit number, as a seller sees it.
//
// Three things had to change and each is a test here: Home and Analytics read ONE definition of
// net (fees, card, labels, the consignor's cut, expenses); a loss renders as a loss instead of
// being clamped to £0; and a month with no costed sales says so instead of printing revenue as
// profit. The numbers come from a fixture so they are exact and nothing is written to the DB.

const STORE = process.env.E2E_STORE || "gfdgsgfsgdfs";
const adminToken = () => {
 const pw = process.env.ADMIN_PASSWORD;
 if (!pw) throw new Error("ADMIN_PASSWORD is required to sign in as the workspace admin");
 return createHash("sha256").update(pw).digest("hex");
};

// A month that looks fine on the old formula and isn't: revenue £1,000, every cost real.
const MARGIN_LOSS = {
 available: true,
 current: {
  coveredSales: 6, totalSales: 9, coveragePct: 66.7, revenueCents: 100_000, taxCents: 0, salesWithoutTax: 0,
  costCents: 40_000, feeCents: 1_000, cardFeeCents: 3_200, labelCostCents: 9_000, consignorCutCents: 30_000, orderSales: 6,
  grossProfitCents: 60_000, grossMarginPct: 60, roiPct: 150, avgProfitPerSaleCents: 10_000,
 },
 prior: null, vsPrior: null, byBrand: [], byCategory: [], bestMargin: [], worstMargin: [],
 activeWithoutCost: 3, activeTotal: 20, inventoryCostCents: 0,
 operating: { totalCents: 25_000, byCategory: [], priorTotalCents: null, recurring: { perOrder: { rateCents: 0, sales: 0, appliedCents: 0 }, monthly: { rateCents: 0, months: 0, appliedCents: 0 } } },
 netProfitCents: -8_200,
 netMarginPct: -8.2,
 profit: {
  lines: [
   { label: "Revenue", cents: 100_000 },
   { label: "Cost of goods", cents: -40_000 },
   { label: "VYA fees", cents: -1_000 },
   { label: "Card processing", cents: -3_200, estimate: true },
   { label: "Shipping labels", cents: -9_000 },
   { label: "Consignor payouts", cents: -30_000 },
   { label: "Expenses", cents: -25_000 },
   { label: "Net profit", cents: -8_200, total: true },
  ],
  missingCostNote: "Cost missing on 3 sold pieces — not counted above.",
 },
};

const MARGIN_UNKNOWN = {
 ...MARGIN_LOSS,
 available: false,
 current: { ...MARGIN_LOSS.current, coveredSales: 0, costCents: 0, feeCents: 0, cardFeeCents: 0, labelCostCents: 0, consignorCutCents: 0 },
 netProfitCents: null, netMarginPct: null,
 profit: { lines: [{ label: "Revenue", cents: 0 }, { label: "Net profit", cents: 0, total: true }], missingCostNote: "Cost missing on 9 sold pieces — not counted above." },
};

async function signIn(page: Page) {
 const base = new URL(page.context()["_options"]?.baseURL ?? process.env.E2E_BASE ?? "http://localhost:3001");
 await page.context().addCookies([{ name: "via_admin_token", value: adminToken(), domain: base.hostname, path: "/" }]);
}

/** Serve the real suite response with the margin section replaced by a fixture. */
async function mockMargin(page: Page, margin: unknown) {
 await page.route(/\/api\/store\/analytics\/suite/, async (route) => {
  const real = await route.fetch();
  const body = await real.json().catch(() => ({}));
  await route.fulfill({ json: { ...body, margin } });
 });
}

test.describe("Home · Net profit", () => {
 test("a loss is shown as a loss, with every cost on its own line", async ({ page }) => {
  await signIn(page);
  await mockMargin(page, MARGIN_LOSS);
  await page.goto(`/admin/home?store=${STORE}`);

  const card = page.locator("text=Net profit ·").locator("..");
  await expect(card).toBeVisible();

  // The headline figure carries a minus and is not £0.
  await expect(card.getByText(/−\$82/).first()).toBeVisible();
  await expect(card.getByText(/−\$82/)).toHaveCount(2); // headline and the closing line agree
  await expect(card.getByText("$0.00", { exact: true })).toHaveCount(0);

  // Every cost the store bore, in reading order.
  for (const label of ["Revenue", "Cost of goods", "VYA fees", "Card processing", "Shipping labels", "Consignor payouts", "Expenses"]) {
   await expect(card.getByText(label, { exact: false }).first()).toBeVisible();
  }
  // Only the card fee is an estimate.
  await expect(card.locator("span", { hasText: /^est$/i })).toHaveCount(1);
  // The honest caveat.
  await expect(card.getByText("Cost missing on 3 sold pieces")).toBeVisible();
 });

 test("no costed sales means a prompt, not a profit", async ({ page }) => {
  await signIn(page);
  await mockMargin(page, MARGIN_UNKNOWN);
  await page.goto(`/admin/home?store=${STORE}`);
  const card = page.locator("text=Net profit ·").locator("..");
  await expect(card.getByText("No cost on record")).toBeVisible();
  await expect(card.getByText("Add what your pieces cost")).toBeVisible();
  // And crucially not a number pretending to be profit.
  await expect(card.getByText(/\$\d/)).toHaveCount(0);
 });
});

test.describe("Analytics · Profit & loss", () => {
 test("selling costs appear between gross and net, and net can be negative", async ({ page }) => {
  await signIn(page);
  await mockMargin(page, MARGIN_LOSS);
  await page.goto(`/admin/dashboard?tab=margin&store=${STORE}`);

  const statement = page.locator("table", { hasText: "Cost of goods" }).first();
  await expect(statement.getByText("Selling costs")).toBeVisible();
  for (const label of ["VYA fees", "Card processing", "Shipping labels", "Consignor payouts"]) {
   await expect(statement.getByText(label, { exact: false }).first()).toBeVisible();
  }
  const net = statement.locator("tr", { hasText: /Net profit/ }).last();
  await expect(net).toContainText("$82");
  await expect(net.locator("td").last().locator("span").first()).toHaveClass(/rose/);
  await expect(page.getByText("Cost missing on 3 sold pieces").first()).toBeVisible();
 });

 test("a cash-only store with no labels or consignors sees no empty selling-cost rows", async ({ page }) => {
  await signIn(page);
  await mockMargin(page, {
   ...MARGIN_LOSS,
   current: { ...MARGIN_LOSS.current, feeCents: 0, cardFeeCents: 0, labelCostCents: 0, consignorCutCents: 0 },
  });
  await page.goto(`/admin/dashboard?tab=margin&store=${STORE}`);
  const statement = page.locator("table", { hasText: "Cost of goods" }).first();
  await expect(statement).toBeVisible();
  await expect(statement.getByText("Selling costs")).toHaveCount(0);
 });
});

test.describe("The real route", () => {
 test("the suite's margin section carries the statement and the caveat", async ({ request }) => {
  const r = await request.get(`/api/store/analytics/suite?sections=margin&period=90d&store=${STORE}`, {
   headers: { Cookie: `via_admin_token=${adminToken()}` },
  });
  expect(r.status()).toBe(200);
  const m = (await r.json()).margin;
  expect(Array.isArray(m.profit.lines)).toBe(true);
  expect(m.profit.lines[0].label).toBe("Revenue");
  expect(m.profit.lines[m.profit.lines.length - 1]).toMatchObject({ label: "Net profit", total: true });
  // Every cost field the engine now carries is present and numeric.
  for (const k of ["feeCents", "cardFeeCents", "labelCostCents", "consignorCutCents", "orderSales"]) {
   expect(typeof m.current[k]).toBe("number");
  }
  // Net is null when nothing sold has a cost, never a number pretending otherwise.
  if (m.current.coveredSales === 0) expect(m.netProfitCents).toBeNull();
 });
});
