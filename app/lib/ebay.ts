/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac } from "crypto";
import { getEbayTokens, saveEbayTokens, updateEbayAccessToken } from "./ebay-tokens-db";

// eBay Sell integration (the current, OAuth-based path — the legacy Trading API is being
// retired). Flow: connect account (authorization-code grant) → create an inventory item
// (keyed by SKU = our itemId) → create an offer → publish it into a live listing. To pull
// a piece, withdraw the offer. All env-gated: with no eBay app configured, callers no-op.

const OAUTH_BASE = "https://api.ebay.com/identity/v1/oauth2/token";
const AUTHORIZE_BASE = "https://auth.ebay.com/oauth2/authorize";
const API = "https://api.ebay.com";
const MARKETPLACE = "EBAY_US";

// Scopes needed to create/publish listings AND manage the seller's business policies —
// `sell.account` (write, not .readonly) lets us opt the account into Business Policies and
// create default payment/shipping/return policies for them, so onboarding needs zero eBay setup.
const SCOPES = [
 "https://api.ebay.com/oauth/api_scope/sell.inventory",
 "https://api.ebay.com/oauth/api_scope/sell.account",
];

export function ebayConfigured(): boolean {
 return !!(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET && process.env.EBAY_RU_NAME);
}
function basicAuth(): string {
 return "Basic " + Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
}

// Sign the OAuth `state` so the callback can trust which store it belongs to (CSRF guard).
export function ebaySignState(slug: string): string {
 const secret = process.env.EBAY_CLIENT_SECRET || process.env.ADMIN_PASSWORD || "via";
 return `${slug}.${createHmac("sha256", secret).update(slug).digest("hex").slice(0, 16)}`;
}

// Step 1 — the consent URL the seller is sent to. `state` carries our store slug back.
export function ebayAuthUrl(state: string): string {
 const p = new URLSearchParams({
 client_id: process.env.EBAY_CLIENT_ID || "",
 redirect_uri: process.env.EBAY_RU_NAME || "",
 response_type: "code",
 scope: SCOPES.join(" "),
 state,
 });
 return `${AUTHORIZE_BASE}?${p.toString()}`;
}

// Step 2 — exchange the authorization code for tokens and store them.
export async function ebayExchangeCode(storeSlug: string, code: string): Promise<boolean> {
 const res = await fetch(OAUTH_BASE, {
 method: "POST",
 headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth() },
 body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: process.env.EBAY_RU_NAME || "" }),
 }).catch(() => null);
 if (!res || !res.ok) return false;
 const j = await res.json().catch(() => null);
 if (!j?.access_token || !j?.refresh_token) return false;
 await saveEbayTokens(storeSlug, { accessToken: j.access_token, refreshToken: j.refresh_token, expiresInSec: Number(j.expires_in) || 7200 });
 return true;
}

// A valid access token, refreshing if expired. Null if not connected / refresh fails.
async function accessToken(storeSlug: string): Promise<string | null> {
 const t = await getEbayTokens(storeSlug);
 if (!t) return null;
 if (new Date(t.expiresAt).getTime() > Date.now()) return t.accessToken;
 const res = await fetch(OAUTH_BASE, {
 method: "POST",
 headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth() },
 body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refreshToken, scope: SCOPES.join(" ") }),
 }).catch(() => null);
 if (!res || !res.ok) return null;
 const j = await res.json().catch(() => null);
 if (!j?.access_token) return null;
 await updateEbayAccessToken(storeSlug, j.access_token, Number(j.expires_in) || 7200);
 return j.access_token;
}

export async function ebayConnected(storeSlug: string): Promise<boolean> {
 return !!(await getEbayTokens(storeSlug));
}

// Orders sold on eBay since `sinceISO`, keyed by SKU (= our itemId). Powers the sale-sync that
// pulls a piece off VYA when it sells on eBay, so it can't double-sell.
export async function getRecentEbaySoldSkus(storeSlug: string, sinceISO: string): Promise<Array<{ sku: string; soldPriceCents: number; orderId: string }>> {
 const token = await accessToken(storeSlug);
 if (!token) return [];
 const filter = encodeURIComponent(`creationdate:[${sinceISO}..]`);
 const r = await ebayFetch(token, `/sell/fulfillment/v1/order?filter=${filter}&limit=100`);
 if (!r.ok || !Array.isArray(r.json?.orders)) return [];
 const out: Array<{ sku: string; soldPriceCents: number; orderId: string }> = [];
 for (const order of r.json.orders) {
 const orderId = String(order.orderId || "");
 for (const li of order.lineItems || []) {
 const sku = li?.sku ? String(li.sku) : "";
 if (!sku) continue;
 const val = Number(li?.lineItemCost?.value ?? li?.total?.value ?? 0);
 out.push({ sku, soldPriceCents: Math.round(val * 100), orderId });
 }
 }
 return out;
}

// Per-listing item-page views from the Sell Analytics traffic report, keyed by eBay listing id.
// Views are the one engagement metric the modern OAuth Sell API exposes cleanly; watch counts and
// incoming Best Offers live only on the legacy Trading API, so they're not pulled here (yet).
// Returns {} on any error — this is a best-effort background enrichment.
export async function getEbayListingViews(storeSlug: string, listingIds: string[]): Promise<Record<string, number>> {
 const ids = Array.from(new Set(listingIds.filter(Boolean)));
 if (!ids.length) return {};
 const token = await accessToken(storeSlug);
 if (!token) return {};

 // Report window: the trailing 30 days ending yesterday (the report lags ~a day).
 const day = 24 * 3600 * 1000;
 const end = new Date(Date.now() - day);
 const start = new Date(end.getTime() - 30 * day);
 const ymd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
 const dateRange = `[${ymd(start)}..${ymd(end)}]`;

 const out: Record<string, number> = {};
 // getTrafficReport caps listing_ids per call; batch to stay well under the limit.
 for (let i = 0; i < ids.length; i += 200) {
 const batch = ids.slice(i, i + 200);
 const filter = `marketplace_ids:{${MARKETPLACE}},date_range:${dateRange},listing_ids:{${batch.join("|")}}`;
 const qs = `dimension=LISTING&metric=LISTING_VIEWS_TOTAL&filter=${encodeURIComponent(filter)}`;
 const r = await ebayFetch(token, `/sell/analytics/v1/traffic_report?${qs}`);
 if (!r.ok || !Array.isArray(r.json?.records)) continue;
 for (const rec of r.json.records) {
 const listingId = String(rec?.dimensionValues?.[0]?.value ?? "");
 const views = Number(rec?.metricValues?.[0]?.value ?? 0);
 if (listingId && Number.isFinite(views)) out[listingId] = Math.max(0, Math.round(views));
 }
 }
 return out;
}

async function ebayFetch(token: string, path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; json: any }> {
 const res = await fetch(`${API}${path}`, {
 ...init,
 headers: {
 Authorization: `Bearer ${token}`,
 "Content-Type": "application/json",
 "Content-Language": "en-US",
 "Accept-Language": "en-US",
 ...(init.headers || {}),
 },
 }).catch(() => null);
 if (!res) return { ok: false, status: 0, json: null };
 const json = await res.json().catch(() => null);
 return { ok: res.ok, status: res.status, json };
}

// The seller's business policies (payment/return/fulfillment) — required to publish.
async function policyIds(token: string): Promise<{ fulfillment?: string; payment?: string; return?: string }> {
 const q = `?marketplace_id=${MARKETPLACE}`;
 const [f, p, r] = await Promise.all([
 ebayFetch(token, `/sell/account/v1/fulfillment_policy${q}`),
 ebayFetch(token, `/sell/account/v1/payment_policy${q}`),
 ebayFetch(token, `/sell/account/v1/return_policy${q}`),
 ]);
 return {
 fulfillment: f.json?.fulfillmentPolicies?.[0]?.fulfillmentPolicyId,
 payment: p.json?.paymentPolicies?.[0]?.paymentPolicyId,
 return: r.json?.returnPolicies?.[0]?.returnPolicyId,
 };
}

const CAT_TYPES = [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }];

// Make a freshly-connected account able to list WITHOUT the seller ever touching eBay's settings:
// (1) opt into the Business Policies program — the fix for eBay's "User is not eligible for Business
// Policy" error, which otherwise blocks every API publish; (2) create sane default payment / return /
// shipping policies for any that are missing. Idempotent + best-effort: existing policies are left
// alone, an already-opted account is fine, and a step eBay rejects is reported (not thrown). Requires
// the `sell.account` write scope — so it only works after the seller reconnects under the new scope.
export type EbaySetup = {
 ok: boolean; optedIn: boolean; created: string[];
 policies: { fulfillment: boolean; payment: boolean; return: boolean }; error?: string;
};
export async function ensureEbayReady(storeSlug: string): Promise<EbaySetup> {
 const empty = { ok: false, optedIn: false, created: [] as string[], policies: { fulfillment: false, payment: false, return: false } };
 const token = await accessToken(storeSlug);
 if (!token) return { ...empty, error: "eBay isn’t connected — reconnect the account." };
 const problems: string[] = [];

 // 1) Opt into Business Policies (idempotent — an account that's already opted in returns an error we ignore).
 const opt = await ebayFetch(token, `/sell/account/v1/program/opt_in`, { method: "POST", body: JSON.stringify({ programType: "SELLING_POLICY_MANAGEMENT" }) });
 const alreadyOpted = /already|opted[- ]?in/i.test(JSON.stringify(opt.json || ""));
 const optedIn = opt.ok || alreadyOpted;
 if (!optedIn) { const e = ebayErr(opt.json); if (e) problems.push(`opt-in ${e}`); }

 // 2) Create defaults for any missing policy (skip ones the seller already has).
 const q = `?marketplace_id=${MARKETPLACE}`;
 const have = await Promise.all([
 ebayFetch(token, `/sell/account/v1/payment_policy${q}`),
 ebayFetch(token, `/sell/account/v1/return_policy${q}`),
 ebayFetch(token, `/sell/account/v1/fulfillment_policy${q}`),
 ]);
 const created: string[] = [];
 const create = async (path: string, label: string, body: Record<string, unknown>) => {
 const res = await ebayFetch(token, path, { method: "POST", body: JSON.stringify(body) });
 if (res.ok) created.push(label);
 else { const e = ebayErr(res.json); if (e) problems.push(`${label} ${e}`); }
 };

 if (!(have[0].json?.paymentPolicies?.length > 0)) {
 await create(`/sell/account/v1/payment_policy`, "payment", {
 name: "VYA Default Payment", marketplaceId: MARKETPLACE, categoryTypes: CAT_TYPES, immediatePay: true,
 });
 }
 if (!(have[1].json?.returnPolicies?.length > 0)) {
 await create(`/sell/account/v1/return_policy`, "return", {
 name: "VYA Default Returns", marketplaceId: MARKETPLACE, categoryTypes: CAT_TYPES,
 returnsAccepted: false,
 });
 }
 if (!(have[2].json?.fulfillmentPolicies?.length > 0)) {
 await create(`/sell/account/v1/fulfillment_policy`, "fulfillment", {
 name: "VYA Default Shipping", marketplaceId: MARKETPLACE, categoryTypes: CAT_TYPES,
 handlingTime: { value: 3, unit: "DAY" },
 shippingOptions: [{
 optionType: "DOMESTIC", costType: "FLAT_RATE",
 // "Other" = a generic economy flat-rate service. Carrier-specific codes (e.g. USPSGroundAdvantage)
 // route through eBay's label system and require the account to be shipping-label eligible, which
 // triggers LOGISTICS_INFO_IS_MISSING when it isn't. A generic service skips that eligibility check.
 shippingServices: [{ sortOrder: 1, shippingServiceCode: "Other", shippingCost: { value: "9.95", currency: "USD" }, freeShipping: false }],
 }],
 });
 }

 // 3) Re-read to confirm the account can now list.
 const pol = await policyIds(token);
 const policies = { fulfillment: !!pol.fulfillment, payment: !!pol.payment, return: !!pol.return };
 const ok = policies.fulfillment && policies.payment && policies.return;
 // If any policy exists, the account is provably opted in (creating one requires it) — reflect that.
 const opted = optedIn || policies.payment || policies.return || policies.fulfillment;
 return { ok, optedIn: opted, created, policies, error: ok ? undefined : (problems[0] || "eBay setup didn’t complete — some business policies are still missing.") };
}

// Suggest a leaf category from the title (eBay requires a categoryId to publish).
async function suggestCategory(token: string, title: string): Promise<string | null> {
 const r = await ebayFetch(token, `/commerce/taxonomy/v1/category_tree/0/get_category_suggestions?q=${encodeURIComponent(title.slice(0, 60))}`);
 return r.json?.categorySuggestions?.[0]?.category?.categoryId || null;
}

const CONDITION_MAP: Record<string, string> = {
 new: "NEW", "like new": "USED_EXCELLENT", excellent: "USED_EXCELLENT", "very good": "USED_VERY_GOOD",
 good: "USED_GOOD", fair: "USED_ACCEPTABLE", vintage: "USED_GOOD",
};

// A category's allowed Size values (+ whether Size is required) — for the 2026 fashion
// size-standardization rule. Free-text sizes get blocked; we must send an allowed value.
async function categoryAspects(token: string, categoryId: string): Promise<{ sizeValues: string[]; sizeRequired: boolean }> {
 const r = await ebayFetch(token, `/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id=${categoryId}`);
 const aspects: any[] = r.json?.aspects || [];
 const size = aspects.find((a) => String(a?.localizedAspectName || "").toLowerCase() === "size");
 return {
 sizeValues: (size?.aspectValues || []).map((v: any) => v?.localizedValue).filter(Boolean),
 sizeRequired: size?.aspectConstraint?.aspectRequired === true,
 };
}

const SIZE_NORMAL: Record<string, string> = {
 "extra small": "XS", xs: "XS", small: "S", s: "S", medium: "M", m: "M",
 large: "L", l: "L", "extra large": "XL", xl: "XL", xxl: "XXL", "2xl": "XXL", "1x": "1X",
};

// Map a free-text size to one of eBay's allowed values for the category. Returns null if
// Size is constrained and nothing matches (caller surfaces a clear error).
function standardizeSize(raw: string, allowed: string[]): string | null {
 const r = (raw || "").trim();
 if (!r) return null;
 const norm = SIZE_NORMAL[r.toLowerCase()] || r;
 if (!allowed.length) return norm; // couldn't fetch the list — send our best guess
 return allowed.find((v) => v.toLowerCase() === norm.toLowerCase()) || allowed.find((v) => v.toLowerCase() === r.toLowerCase()) || null;
}

export type EbayItem = { itemId: string; title: string; description?: string | null; brand?: string | null; condition?: string | null; size?: string | null; priceCents: number; currency?: string; images: string[] };

export type EbayResult = { ok: boolean; listingUrl?: string; error?: string };

// Create/replace inventory item → create offer → publish. Returns the live listing URL.
// Pre-flight: is this store's eBay account actually ready to list? Confirms the token refreshes and
// the API responds (policyIds is an authenticated read), and that the required business policies
// exist — the #1 silent blocker of a real publish. Creates NOTHING on eBay; safe to run anytime.
type PolicyProbe = { status: number; count: number; error: string | null };
export async function testEbayConnection(storeSlug: string): Promise<{
 ok: boolean; configured: boolean; tokenValid: boolean; marketplace: string;
 policies: { fulfillment: boolean; payment: boolean; return: boolean };
 readyToList: boolean; debug?: { fulfillment: PolicyProbe; payment: PolicyProbe; return: PolicyProbe }; error?: string;
}> {
 const base = { ok: false, configured: ebayConfigured(), tokenValid: false, marketplace: MARKETPLACE, policies: { fulfillment: false, payment: false, return: false }, readyToList: false };
 if (!ebayConfigured()) return { ...base, error: "eBay app keys aren’t set on the server." };
 const token = await accessToken(storeSlug);
 if (!token) return { ...base, error: "No valid eBay token — the account isn’t connected, or the refresh token failed. Reconnect it." };
 // Hit the three policy endpoints directly so we can surface eBay's ACTUAL response (status + any
 // error message), not just "empty" — that tells us opt-in vs wrong-marketplace vs a real error.
 const q = `?marketplace_id=${MARKETPLACE}`;
 const [f, p, r] = await Promise.all([
 ebayFetch(token, `/sell/account/v1/fulfillment_policy${q}`),
 ebayFetch(token, `/sell/account/v1/payment_policy${q}`),
 ebayFetch(token, `/sell/account/v1/return_policy${q}`),
 ]);
 const probe = (x: { status: number; json: any }, key: string): PolicyProbe => ({
 status: x.status,
 count: Array.isArray(x.json?.[key]) ? x.json[key].length : 0,
 error: x.json?.errors?.[0]?.longMessage || x.json?.errors?.[0]?.message || null,
 });
 const debug = { fulfillment: probe(f, "fulfillmentPolicies"), payment: probe(p, "paymentPolicies"), return: probe(r, "returnPolicies") };
 const policies = { fulfillment: debug.fulfillment.count > 0, payment: debug.payment.count > 0, return: debug.return.count > 0 };
 const readyToList = policies.fulfillment && policies.payment && policies.return;
 return {
 ok: true, configured: true, tokenValid: true, marketplace: MARKETPLACE, policies, readyToList, debug,
 error: readyToList ? undefined : "No EBAY_US business policies found — see `debug` for eBay’s exact response per policy (opt-in required, wrong marketplace/country, or a specific error).",
 };
}

export async function listOnEbay(storeSlug: string, item: EbayItem): Promise<EbayResult> {
 if (!ebayConfigured()) return { ok: false, error: "eBay isn’t configured on the server." };
 const token = await accessToken(storeSlug);
 if (!token) return { ok: false, error: "eBay isn’t connected — reconnect the account." };
 const sku = item.itemId;
 const images = (item.images || []).filter((u) => /^https?:\/\//.test(u)).slice(0, 12);
 if (!images.length) return { ok: false, error: "eBay needs at least one hosted image." };

 // 1) category + policies + the category's STANDARD aspects, up front. eBay's 2026
 // fashion update blocks free-text sizes on Apparel/Footwear — so we pull the leaf
 // category's allowed Size values from the Taxonomy API and map the piece's size to one.
 const [pol0, categoryId] = await Promise.all([policyIds(token), suggestCategory(token, `${item.brand || ""} ${item.title}`)]);
 let pol = pol0;
 if (!pol.fulfillment || !pol.payment || !pol.return) {
 // Self-heal: opt in + create default policies, then re-read. Fixes accounts connected before
 // auto-setup existed, or where a policy was deleted — no manual eBay setup required.
 const setup = await ensureEbayReady(storeSlug);
 pol = await policyIds(token);
 if (!pol.fulfillment || !pol.payment || !pol.return) {
 return { ok: false, error: setup.error || "Couldn’t set up eBay business policies (payment, shipping, returns) automatically — reconnect eBay and try again." };
 }
 }
 let sizeAspect: string | null = null;
 if (categoryId) {
 const asp = await categoryAspects(token, categoryId);
 sizeAspect = standardizeSize(item.size || "", asp.sizeValues);
 if (asp.sizeRequired && !sizeAspect) {
 return { ok: false, error: `eBay now requires a standard size for this category — “${item.size || "no size"}” isn’t one eBay recognizes. Use a standard size (e.g. S/M/L or a numeric size).` };
 }
 }

 // 2) inventory item, with standardized aspects (Size + Brand).
 const cond = CONDITION_MAP[(item.condition || "").toLowerCase()] || "USED_GOOD";
 const aspects: Record<string, string[]> = {};
 if (item.brand) aspects.Brand = [item.brand];
 if (sizeAspect) aspects.Size = [sizeAspect];
 const inv = await ebayFetch(token, `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
 method: "PUT",
 body: JSON.stringify({
 availability: { shipToLocationAvailability: { quantity: 1 } },
 condition: cond,
 product: {
 title: item.title.slice(0, 80),
 description: (item.description || item.title).slice(0, 4000),
 imageUrls: images,
 ...(item.brand ? { brand: item.brand } : {}),
 ...(Object.keys(aspects).length ? { aspects } : {}),
 },
 }),
 });
 if (!inv.ok) return { ok: false, error: ebayErr(inv.json) || "Couldn’t create the inventory item." };

 // 3) offer (category resolved above).
 const price = (item.priceCents / 100).toFixed(2);
 const offer = await ebayFetch(token, `/sell/inventory/v1/offer`, {
 method: "POST",
 body: JSON.stringify({
 sku, marketplaceId: MARKETPLACE, format: "FIXED_PRICE", availableQuantity: 1,
 ...(categoryId ? { categoryId } : {}),
 pricingSummary: { price: { value: price, currency: item.currency || "USD" } },
 listingPolicies: { fulfillmentPolicyId: pol.fulfillment, paymentPolicyId: pol.payment, returnPolicyId: pol.return },
 }),
 });
 // Offer may already exist (re-list) — look it up and update instead.
 let offerId: string | undefined = offer.json?.offerId;
 if (!offer.ok) {
 const existing = await ebayFetch(token, `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`);
 offerId = existing.json?.offers?.[0]?.offerId;
 if (!offerId) return { ok: false, error: ebayErr(offer.json) || "Couldn’t create the eBay offer." };
 }

 // 4) publish
 const pub = await ebayFetch(token, `/sell/inventory/v1/offer/${offerId}/publish`, { method: "POST" });
 if (!pub.ok) return { ok: false, error: ebayErr(pub.json) || "Couldn’t publish the listing." };
 const listingId = pub.json?.listingId;
 return { ok: true, listingUrl: listingId ? `https://www.ebay.com/itm/${listingId}` : undefined };
}

// Withdraw the offer for a SKU (ends the live listing) — used when it sells elsewhere.
export async function endOnEbay(storeSlug: string, itemId: string): Promise<boolean> {
 if (!ebayConfigured()) return false;
 const token = await accessToken(storeSlug);
 if (!token) return false;
 const existing = await ebayFetch(token, `/sell/inventory/v1/offer?sku=${encodeURIComponent(itemId)}`);
 const offerId = existing.json?.offers?.[0]?.offerId;
 if (!offerId) return false;
 const r = await ebayFetch(token, `/sell/inventory/v1/offer/${offerId}/withdraw`, { method: "POST" });
 return r.ok;
}

function ebayErr(j: any): string | null {
 const e = j?.errors?.[0];
 if (!e) return null;
 // eBay's `message` is often a template like "Invalid ." with the field left blank — the actual
 // offending field is in `parameters`. Surface longMessage + the parameters so errors are usable.
 const params = Array.isArray(e.parameters) ? e.parameters.map((p: any) => `${p.name}=${p.value}`).filter(Boolean).join(", ") : "";
 const msg = e.longMessage || e.message || "error";
 return `eBay: ${msg}${params ? ` [${params}]` : ""}`;
}
