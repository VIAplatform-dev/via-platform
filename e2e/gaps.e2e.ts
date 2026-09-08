import { test, expect, type Page } from "playwright/test";
import { createHash } from "node:crypto";

// The last four parity gaps: provenance on Add a piece, condition/flaws/measurements in the
// bulk-upload editor, and the in-page storefront editor saving to the store it is editing.
//
// Bulk runs entirely on fixtures (route interception) — the AI, the autosave and the PATCH are all
// answered here, so nothing is written. The editor check only reads a captured page.

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

const SHIPPING_GB = { currency: "GBP", mode: "buyer_pays", freeThresholdUsd: null, shipFrom: { country: "GB" }, zones: { domestic: { enabled: true } }, tiers: [], dutyMode: "buyer_pays", effectiveDutyMode: "buyer_pays", dutyDowngraded: false, carrierConnected: false };

test.describe("Add a piece · provenance (#18)", () => {
 test("Where it came from and Acquired on sit beside Cost, with her previous sources as a datalist", async ({ page }) => {
  await signIn(page);
  await page.route(/\/api\/store\/items(\?.*)?$/, (r) => r.fulfill({ json: { items: [
   { id: "a", title: "One", status: "active", sourceName: "Kempton" }, { id: "b", title: "Two", status: "sold", sourceName: "Ana’s estate" }, { id: "c", title: "Three", status: "active", sourceName: "Kempton" },
  ] } }));
  await page.goto(`/admin/add-listing?store=${STORE}`);
  const prov = page.getByTestId("provenance");
  await expect(prov).toBeVisible();
  await expect(prov).toContainText("Where it came from");
  await expect(prov).toContainText("Acquired on");
  const source = prov.locator("input[list=source-names]");
  await expect(source).toHaveAttribute("placeholder", /Kempton/);
  // Her own previous names, deduped and sorted — the same list the inventory editor offers.
  await expect(prov.locator("datalist#source-names option")).toHaveCount(2);
  const date = prov.locator("input[type=date]");
  await expect(date).toHaveValue("");
  await source.fill("Kempton");
  await date.fill("2026-09-01");
  await expect(source).toHaveValue("Kempton");
  await expect(date).toHaveValue("2026-09-01");
  // Provenance is the piece's private side: it sits right after Cost.
  const costBox = await page.getByText("Cost ($)").boundingBox();
  const provBox = await prov.boundingBox();
  expect(provBox!.y).toBeGreaterThan(costBox!.y);
 });
});

test.describe("Bulk upload · the editor has condition, flaws and measurements (#17, #31)", () => {
 test("the AI's flaws and grade prefill the editor, the note and the template save through the same PATCH", async ({ page }) => {
  await signIn(page);
  const sentence = "Light wear at the cuffs, otherwise lovely";
  const patches: Record<string, unknown>[] = [];
  await page.route(/\/api\/store\/shipping(\?.*)?$/, (r) => r.fulfill({ json: SHIPPING_GB }));
  await page.route(/\/api\/store\/collections(\?.*)?$/, (r) => r.fulfill({ json: { collections: [] } }));
  await page.route(/\/api\/store\/listings\/upload(\?.*)?$/, (r) => r.fulfill({ json: { url: "https://example.com/cardigan.png" } }));
  await page.route(/\/api\/store\/intake\/bulk-group(\?.*)?$/, (r) => r.fulfill({ json: { groups: [["https://example.com/cardigan.png"]] } }));
  await page.route(/\/api\/store\/intake(\?.*)?$/, (r) => r.fulfill({ json: {
   draft: {
    title: "Green Fendi cardigan", description: "A cardigan.", category: "coats-jackets",
    brand: { value: "Fendi", confidence: 0.9 }, era: { value: "1990s", confidence: 0.6 }, material: { value: "Wool", confidence: 0.8 },
    condition: { value: sentence, confidence: 0.8 }, conditionGrade: "Very Good",
    flaws: ["light pilling at cuffs", "tiny mark inside"],
    parcel: { weightOz: 12, lengthIn: 12, widthIn: 9, heightIn: 3 },
   },
   questions: [],
  } }));
  await page.route(/\/api\/store\/intake\/pricing(\?.*)?$/, (r) => r.fulfill({ json: { estimate: { suggestedCents: 12000, lowCents: 9000, highCents: 15000, marketCents: 12000, rationale: "Comparable cardigans." } } }));
  await page.route(/\/api\/store\/intake\/autosave(\?.*)?$/, (r) => r.fulfill({ json: { ok: true, id: "bulk-e2e" } }));
  await page.route(/\/api\/store\/items\/bulk-e2e(\?.*)?$/, (r) => { patches.push(r.request().postDataJSON()); r.fulfill({ json: { ok: true } }); });
  await page.route(/\/api\/store\/items(\?.*)?$/, (r) => {
   if (r.request().method() === "GET") return r.fulfill({ json: { items: [{ id: "bulk-e2e", title: "Green Fendi cardigan", status: "draft", costCents: null, weightOz: 12, lengthIn: 12, widthIn: 9, heightIn: 3, collections: [], measurementsJson: [{ key: "pitToPit", value: 48, unit: "cm" }] }] } });
   return r.fulfill({ json: { ok: true, count: 1 } });
  });

  await page.goto(`/admin/bulk-upload?store=${STORE}`);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await page.locator("input[type=file]").first().setInputFiles({ name: "cardigan.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: /^Draft 1 item$/ }).click();
  await page.getByRole("button", { name: "Edit draft" }).click();

  // What the AI worked out, as structure: the grade on the chips, its sentence as the note, the flaws as a list.
  const chips = page.getByTestId("condition-chips");
  await expect(chips.getByRole("button", { name: "Very good", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(chips.getByLabel("Condition note")).toHaveValue(sentence);
  const flaws = page.getByTestId("flaws-editor");
  await expect(flaws.locator("li")).toHaveCount(2);
  await expect(flaws.locator("li").first()).toContainText("light pilling at cuffs");
  // And they were written onto the draft the moment it was made — not only kept on the card.
  const drafted = patches.find((p) => Array.isArray(p.flaws));
  expect(drafted?.flaws).toEqual(["light pilling at cuffs", "tiny mark inside"]);
  expect(drafted?.conditionNote).toBe(sentence);
  expect(drafted?.condition).toBe("Very good");

  // The category's template, in the store's unit, with the saved number already in it.
  const fields = page.getByTestId("measurement-fields");
  await expect(fields).toContainText("centimetres");
  await expect(fields.getByLabel("Pit to pit")).toHaveValue("48");
  await expect(fields.getByLabel("Sleeve")).toBeVisible();

  // Edit all three and save: one PATCH, the same shape the inventory editor sends.
  await flaws.locator("input").fill("scuffed button");
  await flaws.locator("input").press("Enter");
  await expect(flaws.locator("li")).toHaveCount(3);
  await chips.getByLabel("Condition note").fill("Light wear at the cuffs");
  await fields.getByLabel("Length").fill("62.5");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit draft" })).toHaveCount(0);
  const saved = patches[patches.length - 1];
  expect(saved.flaws).toEqual(["light pilling at cuffs", "tiny mark inside", "scuffed button"]);
  expect(saved.conditionNote).toBe("Light wear at the cuffs");
  expect(saved.condition).toBe("Very good");
  expect(saved.measurements).toEqual([{ key: "pitToPit", value: 48, unit: "cm" }, { key: "length", value: 62.5, unit: "cm" }]);
 });
});

test.describe("Storefront editor · saves carry the store (#Tier 2 leftover)", () => {
 test("the injected edit script routes both saves through ?store=<slug> from the page path", async ({ request }) => {
  const res = await request.get("/site/sourcedbyscottie/?edit=1", { headers: cookie() });
  test.skip(res.status() === 404, "sourcedbyscottie has no capture on this server");
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain("window.__VYA_EDIT=");
  expect(html).toContain('fetch(vyaStore("/api/store/capture/edit")');
  expect(html).toContain('fetch(vyaStore("/api/store/assets")');
  expect(html).toContain('"store="+encodeURIComponent(m[1])');
  expect(html).not.toContain('fetch("/api/store/capture/edit"');
 });
});
