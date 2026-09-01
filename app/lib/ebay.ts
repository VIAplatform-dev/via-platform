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

// Application token (client_credentials) for eBay's PUBLIC catalog APIs — Taxonomy category
// suggestions + item aspects. These aren't seller-scoped, and the seller's user token (sell.inventory
// + sell.account) is NOT permitted to call them — it returns 403 "Insufficient permissions", which
// silently left every listing without a category and failed publish. The base api_scope on an app
// token is the right credential here. Cached until ~1min before expiry.
let appTok: { token: string; exp: number } | null = null;
async function appToken(): Promise<string | null> {
 if (!ebayConfigured()) return null;
 if (appTok && appTok.exp > Date.now() + 60_000) return appTok.token;
 const res = await fetch(OAUTH_BASE, {
 method: "POST",
 headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth() },
 body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
 }).catch(() => null);
 if (!res || !res.ok) return null;
 const d = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
 if (!d?.access_token) return null;
 appTok = { token: d.access_token, exp: Date.now() + (d.expires_in ?? 7200) * 1000 };
 return appTok.token;
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

// The seller's inventory (ship-from) location — REQUIRED to publish an offer. Publishing without a
// merchantLocationKey fails with error 25002 ("The merchantLocationKey is required"), the silent
// blocker behind "I'm a business account but it still won't list". We prefer an ENABLED location the
// seller already has (established accounts do — correct address, no guessing); only if they have none
// do we create a default one under their account. Idempotent + best-effort.
async function ensureLocationKey(token: string): Promise<string | null> {
 const list = await ebayFetch(token, `/sell/inventory/v1/location?limit=100`);
 const locs: any[] = Array.isArray(list.json?.locations) ? list.json.locations : [];
 const enabled = locs.find((l) => String(l?.merchantLocationStatus || "").toUpperCase() === "ENABLED");
 const reuse = enabled || locs[0];
 if (reuse?.merchantLocationKey) return String(reuse.merchantLocationKey);
 // None exists — create a default. postalCode is required for US; EBAY_DEFAULT_POSTAL lets ops set a
 // real ship-from zip (shipping here is flat-rate, so distance doesn't affect buyer cost).
 const key = "VYA_DEFAULT";
 const res = await ebayFetch(token, `/sell/inventory/v1/location/${key}`, {
  method: "POST",
  body: JSON.stringify({
   location: { address: { country: "US", postalCode: process.env.EBAY_DEFAULT_POSTAL || "10001" } },
   name: "VYA Default Location", locationTypes: ["WAREHOUSE"], merchantLocationStatus: "ENABLED",
  }),
 });
 if (res.ok || /already exists|25801/i.test(JSON.stringify(res.json || ""))) return key;
 return null;
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
 policies: { fulfillment: boolean; payment: boolean; return: boolean }; hasLocation?: boolean; error?: string;
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

 // 3) Ensure a ship-from inventory location exists — publish requires one, and the status check
 //    (testEbayConnection) reports "not ready" without it. Creating it here (not just on first list)
 //    is what makes "Set up automatically" actually stick on reload.
 const locationKey = await ensureLocationKey(token);
 const hasLocation = !!locationKey;
 if (!hasLocation) problems.push("couldn’t create a ship-from inventory location");

 // 4) Re-read to confirm the account can now list.
 const pol = await policyIds(token);
 const policies = { fulfillment: !!pol.fulfillment, payment: !!pol.payment, return: !!pol.return };
 const ok = policies.fulfillment && policies.payment && policies.return && hasLocation;
 // If any policy exists, the account is provably opted in (creating one requires it) — reflect that.
 const opted = optedIn || policies.payment || policies.return || policies.fulfillment;
 return { ok, optedIn: opted, created, policies, hasLocation, error: ok ? undefined : (problems[0] || "eBay setup didn’t complete — some business policies are still missing.") };
}

// Suggest a leaf category from the title (eBay requires a categoryId to publish).
async function suggestCategory(title: string): Promise<string | null> {
 const token = await appToken();
 if (!token) return null;
 const r = await ebayFetch(token, `/commerce/taxonomy/v1/category_tree/0/get_category_suggestions?q=${encodeURIComponent(title.slice(0, 60))}`);
 return r.json?.categorySuggestions?.[0]?.category?.categoryId || null;
}

const CONDITION_MAP: Record<string, string> = {
 new: "NEW", "like new": "USED_EXCELLENT", excellent: "USED_EXCELLENT", "very good": "USED_VERY_GOOD",
 good: "USED_GOOD", fair: "USED_ACCEPTABLE", vintage: "USED_GOOD",
};

// eBay REST ConditionEnum → the numeric conditionId eBay maps it to. A category's policy lists which
// IDs it ACCEPTS (fashion now uses the "Pre-owned" IDs 2990/3000/3010; the old 4000/5000/6000 "Used"
// tiers are rejected on e.g. handbags). We map the piece's condition to an enum whose ID the category
// actually allows — otherwise publish fails with "condition id is invalid for the primary category".
const COND_ENUM_ID: Record<string, string> = {
 NEW: "1000", NEW_OTHER: "1500", NEW_WITH_DEFECTS: "1750", LIKE_NEW: "2750",
 PRE_OWNED_EXCELLENT: "2990", USED_EXCELLENT: "3000", PRE_OWNED_FAIR: "3010",
 USED_VERY_GOOD: "4000", USED_GOOD: "5000", USED_ACCEPTABLE: "6000",
};
// For each of our condition words, the enums to try in order of preference (best fidelity first).
const CONDITION_PREFS: Record<string, string[]> = {
 new: ["NEW", "NEW_OTHER"],
 "like new": ["LIKE_NEW", "USED_EXCELLENT", "PRE_OWNED_EXCELLENT"],
 excellent: ["USED_EXCELLENT", "PRE_OWNED_EXCELLENT", "USED_VERY_GOOD"],
 "very good": ["USED_VERY_GOOD", "USED_EXCELLENT", "PRE_OWNED_EXCELLENT"],
 good: ["USED_GOOD", "USED_EXCELLENT", "PRE_OWNED_EXCELLENT", "USED_VERY_GOOD"],
 fair: ["USED_ACCEPTABLE", "PRE_OWNED_FAIR", "USED_GOOD"],
 vintage: ["USED_EXCELLENT", "PRE_OWNED_EXCELLENT", "USED_GOOD"],
};

// A category's accepted condition IDs (+ whether condition is required). Sell Metadata API — needs the
// seller (user) token; the app token 404s here.
async function conditionPolicies(token: string, categoryId: string): Promise<{ ids: string[]; required: boolean }> {
 const r = await ebayFetch(token, `/sell/metadata/v1/marketplace/${MARKETPLACE}/get_item_condition_policies?filter=${encodeURIComponent("categoryIds:{" + categoryId + "}")}`);
 const pol = r.json?.itemConditionPolicies?.[0];
 return { ids: (pol?.itemConditions || []).map((c: any) => String(c.conditionId)).filter(Boolean), required: pol?.itemConditionRequired === true };
}

// Choose a ConditionEnum the category will accept, closest to the piece's actual condition.
function pickCondition(raw: string, allowedIds: string[]): string {
 const prefs = CONDITION_PREFS[(raw || "").toLowerCase()] || CONDITION_PREFS.good;
 if (!allowedIds.length) return prefs[0]; // couldn't read the policy — send our best guess
 for (const en of prefs) if (allowedIds.includes(COND_ENUM_ID[en])) return en;
 // Nothing preferred matched — fall through any allowed used tier, then any new tier.
 for (const en of ["USED_EXCELLENT", "PRE_OWNED_EXCELLENT", "PRE_OWNED_FAIR", "USED_VERY_GOOD", "USED_GOOD", "USED_ACCEPTABLE"]) if (allowedIds.includes(COND_ENUM_ID[en])) return en;
 for (const en of ["NEW_OTHER", "NEW", "NEW_WITH_DEFECTS"]) if (allowedIds.includes(COND_ENUM_ID[en])) return en;
 return prefs[0];
}

// A category's allowed Size values (+ whether Size is required) — for the 2026 fashion
// size-standardization rule. Free-text sizes get blocked; we must send an allowed value.
type AspectMeta = { name: string; required: boolean; selectionOnly: boolean; values: string[] };
async function categoryAspects(categoryId: string): Promise<{ sizeValues: string[]; sizeRequired: boolean; all: AspectMeta[] }> {
 const token = await appToken();
 if (!token) return { sizeValues: [], sizeRequired: false, all: [] };
 const r = await ebayFetch(token, `/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id=${categoryId}`);
 const aspects: any[] = r.json?.aspects || [];
 const all: AspectMeta[] = aspects.map((a) => ({
 name: String(a?.localizedAspectName || ""),
 required: a?.aspectConstraint?.aspectRequired === true,
 selectionOnly: a?.aspectConstraint?.aspectMode === "SELECTION_ONLY",
 values: (a?.aspectValues || []).map((v: any) => v?.localizedValue).filter(Boolean),
 }));
 const size = all.find((a) => a.name.toLowerCase() === "size");
 return { sizeValues: size?.values || [], sizeRequired: !!size?.required, all };
}

// Common colours to recover an "Exterior Color"/"Color" item-specific from the title/description, since
// VYA doesn't store colour. Longer names first so "royal blue" → "Blue" not a partial miss.
const COLOR_WORDS = ["multicolor","rose gold","royal blue","navy","black","white","ivory","cream","beige","tan","brown","camel","burgundy","maroon","red","pink","fuchsia","coral","orange","gold","yellow","olive","khaki","green","teal","turquoise","blue","purple","lavender","lilac","grey","gray","silver","charcoal"];
function parseColor(item: EbayItem): string | null {
 const hay = `${item.title || ""} ${item.description || ""}`.toLowerCase();
 for (const c of COLOR_WORDS) if (new RegExp(`\\b${c}\\b`).test(hay)) return c.replace(/\\b\\w/g, (m) => m.toUpperCase());
 return null;
}

// Resolve a publishable value for a REQUIRED category aspect eBay demands. Uses VYA data where we have
// it (brand, material), recovers colour from text, and picks a safe default otherwise so publish
// doesn't fail on a missing item specific. Selection-only aspects must match an allowed value exactly.
function resolveAspect(a: AspectMeta, item: EbayItem): string | null {
 const n = a.name.toLowerCase();
 const inList = (v: string) => a.values.find((x) => x.toLowerCase() === v.toLowerCase()) || null;
 const val = (v: string) => (a.selectionOnly ? inList(v) : v);
 if (n === "brand") return val(item.brand || "Unbranded") || item.brand || "Unbranded";
 if (n.includes("color") || n.includes("colour")) return val(parseColor(item) || "Multicolor") || "Multicolor";
 if (n.includes("material")) return val(item.material || "Other") || (a.selectionOnly ? a.values[0] || null : item.material || "Other");
 if (n === "department") return inList("Women") || inList("Unisex Adults") || a.values[0] || (a.selectionOnly ? null : "Women");
 if (n === "type" || n.includes("style")) {
 const t = (item.title || "").toLowerCase();
 const m = a.values.find((v) => v && t.includes(v.toLowerCase()));
 return m || (a.selectionOnly ? a.values[0] || null : "Other");
 }
 return a.selectionOnly ? a.values[0] || null : "Does Not Apply";
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

export type EbayItem = { itemId: string; title: string; description?: string | null; brand?: string | null; condition?: string | null; size?: string | null; material?: string | null; priceCents: number; currency?: string; images: string[] };

export type EbayResult = { ok: boolean; listingUrl?: string; error?: string };

// Create/replace inventory item → create offer → publish. Returns the live listing URL.
// Pre-flight: is this store's eBay account actually ready to list? Confirms the token refreshes and
// the API responds (policyIds is an authenticated read), and that the required business policies
// exist — the #1 silent blocker of a real publish. Creates NOTHING on eBay; safe to run anytime.
type PolicyProbe = { status: number; count: number; error: string | null };
export async function testEbayConnection(storeSlug: string): Promise<{
 ok: boolean; configured: boolean; tokenValid: boolean; marketplace: string; sellerRegistered: boolean;
 policies: { fulfillment: boolean; payment: boolean; return: boolean };
 hasLocation: boolean; readyToList: boolean; debug?: { fulfillment: PolicyProbe; payment: PolicyProbe; return: PolicyProbe }; error?: string;
}> {
 const base = { ok: false, configured: ebayConfigured(), tokenValid: false, marketplace: MARKETPLACE, sellerRegistered: false, policies: { fulfillment: false, payment: false, return: false }, hasLocation: false, readyToList: false };
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
 // A ship-from inventory location is also required to publish (missing one → error 25002 on publish).
 const locRes = await ebayFetch(token, `/sell/inventory/v1/location?limit=1`);
 const hasLocation = Array.isArray(locRes.json?.locations) && locRes.json.locations.length > 0;
 // Is the connected account actually a registered seller? An account that only ever bought returns
 // sellerRegistrationCompleted=false and CANNOT list — the "wrong account connected" case. This is the
 // most fundamental gate, so it's checked and surfaced first.
 const priv = await ebayFetch(token, `/sell/account/v1/privilege`);
 const sellerRegistered = priv.json?.sellerRegistrationCompleted === true;
 const policiesOk = policies.fulfillment && policies.payment && policies.return;
 const readyToList = sellerRegistered && policiesOk && hasLocation;
 return {
 ok: true, configured: true, tokenValid: true, marketplace: MARKETPLACE, sellerRegistered, policies, hasLocation, readyToList, debug,
 error: readyToList ? undefined
 : !sellerRegistered
 ? "This eBay account isn’t set up to sell — it hasn’t completed seller registration on eBay (or a non-seller account was connected). Reconnect your eBay seller account, or finish seller sign-up on eBay."
 : !policiesOk
 ? "eBay business policies aren’t set up yet — click “Set up automatically” to create them."
 : "eBay needs a ship-from location — click “Set up automatically” to create one.",
 };
}

export async function listOnEbay(storeSlug: string, item: EbayItem): Promise<EbayResult> {
 if (!ebayConfigured()) return { ok: false, error: "eBay isn’t configured on the server." };
 const token = await accessToken(storeSlug);
 if (!token) return { ok: false, error: "eBay isn’t connected — reconnect the account." };
 const sku = item.itemId;
 // 12 is the cap we send EBAY, not VYA's own limit — see app/lib/item-limits.ts.
 const images = (item.images || []).filter((u) => /^https?:\/\//.test(u)).slice(0, 12);
 if (!images.length) return { ok: false, error: "eBay needs at least one hosted image." };

 // 1) category + policies + the category's STANDARD aspects, up front. eBay's 2026
 // fashion update blocks free-text sizes on Apparel/Footwear — so we pull the leaf
 // category's allowed Size values from the Taxonomy API and map the piece's size to one.
 const [pol0, categoryId] = await Promise.all([policyIds(token), suggestCategory(`${item.brand || ""} ${item.title}`)]);
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
 let metaAll: AspectMeta[] = [];
 if (categoryId) {
 const asp = await categoryAspects(categoryId);
 metaAll = asp.all;
 sizeAspect = standardizeSize(item.size || "", asp.sizeValues);
 if (asp.sizeRequired && !sizeAspect) {
 return { ok: false, error: `eBay now requires a standard size for this category — “${item.size || "no size"}” isn’t one eBay recognizes. Use a standard size (e.g. S/M/L or a numeric size).` };
 }
 }

 // 2) inventory item, with standardized aspects (Size + Brand) and a category-valid condition.
 let cond = CONDITION_MAP[(item.condition || "").toLowerCase()] || "USED_EXCELLENT";
 if (categoryId) {
 const cpol = await conditionPolicies(token, categoryId);
 cond = pickCondition(item.condition || "", cpol.ids);
 }
 const aspects: Record<string, string[]> = {};
 if (item.brand) aspects.Brand = [item.brand];
 if (sizeAspect) aspects.Size = [sizeAspect];
 // eBay requires an MPN (Manufacturer Part Number) aspect on many fashion categories; vintage/
 // resale pieces don't have one, so send the value eBay mandates for that case, or publish fails
 // with "Input data for tag <BrandMPN> is invalid or missing".
 aspects.MPN = ["Does Not Apply"];
 // Fill every OTHER required item-specific the category demands (Exterior Color, Material, Style,
 // Department, …). Missing any required aspect fails publish; VYA lacks some, so resolveAspect picks a
 // valid best value (colour recovered from the title, a safe default otherwise).
 for (const a of metaAll) {
 if (!a.required || aspects[a.name]) continue;
 const v = resolveAspect(a, item);
 if (v) aspects[a.name] = [v];
 }
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

 // 3) offer (category resolved above) — needs a ship-from location, or publish 25002's.
 const locationKey = await ensureLocationKey(token);
 if (!locationKey) return { ok: false, error: "eBay needs a ship-from inventory location and one couldn’t be set up — reconnect eBay and try again." };
 const price = (item.priceCents / 100).toFixed(2);
 const offerBody = {
 sku, marketplaceId: MARKETPLACE, format: "FIXED_PRICE", availableQuantity: 1,
 merchantLocationKey: locationKey,
 ...(categoryId ? { categoryId } : {}),
 pricingSummary: { price: { value: price, currency: item.currency || "USD" } },
 listingPolicies: { fulfillmentPolicyId: pol.fulfillment, paymentPolicyId: pol.payment, returnPolicyId: pol.return },
 };
 const offer = await ebayFetch(token, `/sell/inventory/v1/offer`, { method: "POST", body: JSON.stringify(offerBody) });
 // Offer may already exist (re-list) — look it up and UPDATE it, so an offer created before this fix
 // (without a location) gets the merchantLocationKey + current price/policies before publishing.
 let offerId: string | undefined = offer.json?.offerId;
 if (!offer.ok) {
 const existing = await ebayFetch(token, `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`);
 offerId = existing.json?.offers?.[0]?.offerId;
 if (!offerId) return { ok: false, error: ebayErr(offer.json) || "Couldn’t create the eBay offer." };
 await ebayFetch(token, `/sell/inventory/v1/offer/${offerId}`, { method: "PUT", body: JSON.stringify(offerBody) });
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

// eBay writes its errors for developers integrating the API, not for someone running a vintage
// shop. "Input data for tag <BrandMPN> is invalid or missing. Please check API documentation."
// means "this piece has no brand on it" — but a seller reading it has no way to know that, and
// nothing in the sentence tells her what to go and change.
//
// So: translate the failures we actually hit into the one action that fixes each, and keep eBay's
// own words for anything unrecognised (a message we can't translate is still better than silence).
// Matched against eBay's text AND its `parameters`, because the offending field is usually only
// named in the parameters.
const EBAY_PLAIN: { match: RegExp; say: string }[] = [
 { match: /brandmpn|\bbrand\b[^.]*\b(missing|invalid|required)/i,
   say: "this piece has no brand. Add one, then retry." },
 { match: /\bmpn\b[^.]*\b(missing|invalid|required)/i,
   say: "this piece has no brand. Add one, then retry." },
 { match: /condition[^.]*\b(missing|invalid|required)/i,
   say: "this piece has no condition set. Add one, then retry." },
 { match: /categor(y|ies)[^.]*\b(missing|invalid|required|not found)/i,
   say: "eBay couldn’t work out the category. Set one on the piece, then retry." },
 { match: /(item specific|aspect)[^.]*\b(missing|invalid|required)/i,
   say: "eBay wants more detail for this category — add the piece’s brand, size and material." },
 { match: /(picture|image)[^.]*\b(missing|invalid|required)/i,
   say: "there’s no photo on this piece. Add one, then retry." },
 { match: /\bprice\b[^.]*\b(missing|invalid|required)/i,
   say: "eBay rejected the price. Check it, then retry." },
];

function ebayErr(j: any): string | null {
 const e = j?.errors?.[0];
 if (!e) return null;
 // eBay's `message` is often a template like "Invalid ." with the field left blank — the actual
 // offending field is in `parameters`. Surface longMessage + the parameters so errors are usable.
 const params = Array.isArray(e.parameters) ? e.parameters.map((p: any) => `${p.name}=${p.value}`).filter(Boolean).join(", ") : "";
 const msg = e.longMessage || e.message || "error";
 const plain = EBAY_PLAIN.find((r) => r.match.test(`${msg} ${params}`));
 if (plain) return plain.say;
 return `eBay: ${msg}${params ? ` [${params}]` : ""}`;
}
