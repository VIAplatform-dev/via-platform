import crypto from "crypto";
import { getEtsyTokens, saveEtsyTokens, updateEtsyTokens, saveEtsyShop } from "./etsy-tokens-db";

// Etsy Open API v3 integration. OAuth2 with PKCE, per seller. Mirrors the eBay integration:
// auto-list new pieces and (the important bit) auto-DEACTIVATE a listing the moment the piece
// sells elsewhere, so a one-of-one never double-sells.
//
// Requires three env vars (from your Etsy app, https://www.etsy.com/developers/your-apps):
//   ETSY_KEYSTRING: the app's keystring (the OAuth client_id, and the FIRST half of x-api-key)
//   ETSY_CLIENT_SECRET: the app's shared secret (the SECOND half of x-api-key: "keystring:secret")
//   ETSY_REDIRECT_URI: must exactly match a redirect URI registered on the Etsy app

const AUTHORIZE = "https://www.etsy.com/oauth/connect";
const TOKEN = "https://api.etsy.com/v3/public/oauth/token";
const API = "https://openapi.etsy.com/v3/application";
// No listings_d (delete): the "delist" sets a listing to inactive, which is an edit (listings_w),
// not a delete. Requesting delete is the top red flag for new Etsy app review. Don't ask for it.
const SCOPES = ["listings_r", "listings_w", "transactions_r", "shops_r"];

export type EtsyResult = { ok: boolean; listingUrl?: string; listingId?: string; error?: string };
export type EtsyItem = { itemId: string; title: string; description: string; priceUsd: number; imageUrls: string[] };

export function etsyConfigured(): boolean {
 return !!(process.env.ETSY_KEYSTRING && process.env.ETSY_REDIRECT_URI);
}
const keystring = () => process.env.ETSY_KEYSTRING || "";
// Etsy's x-api-key header is "keystring:shared_secret" (per API v3 Request Standards).
const apiKey = () => `${process.env.ETSY_KEYSTRING || ""}:${process.env.ETSY_CLIENT_SECRET || ""}`;

// Signed state ties the OAuth round-trip to a store slug (tamper-proof).
export function etsySignState(slug: string): string {
 const secret = process.env.ETSY_CLIENT_SECRET || process.env.ADMIN_PASSWORD || "via";
 const sig = crypto.createHmac("sha256", secret).update(slug).digest("hex").slice(0, 24);
 return `${slug}.${sig}`;
}
export function etsyVerifyState(state: string): string | null {
 const slug = state.split(".")[0];
 return slug && etsySignState(slug) === state ? slug : null;
}

// ── PKCE ──
export function makePkce(): { verifier: string; challenge: string } {
 const verifier = crypto.randomBytes(48).toString("base64url");
 const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
 return { verifier, challenge };
}

export function etsyAuthUrl(state: string, codeChallenge: string): string {
 const p = new URLSearchParams({
 response_type: "code",
 client_id: keystring(),
 redirect_uri: process.env.ETSY_REDIRECT_URI || "",
 scope: SCOPES.join(" "),
 state,
 code_challenge: codeChallenge,
 code_challenge_method: "S256",
 });
 return `${AUTHORIZE}?${p.toString()}`;
}

// Exchange the authorization code (+ PKCE verifier) for tokens, then resolve & cache the shop.
export async function etsyExchangeCode(storeSlug: string, code: string, verifier: string): Promise<boolean> {
 const res = await fetch(TOKEN, {
 method: "POST",
 headers: { "Content-Type": "application/x-www-form-urlencoded" },
 body: new URLSearchParams({
 grant_type: "authorization_code",
 client_id: keystring(),
 redirect_uri: process.env.ETSY_REDIRECT_URI || "",
 code,
 code_verifier: verifier,
 }),
 }).catch(() => null);
 if (!res) return false;
 const j = await res.json().catch(() => null) as { access_token?: string; refresh_token?: string; expires_in?: number } | null;
 if (!j?.access_token || !j?.refresh_token) return false;
 await saveEtsyTokens(storeSlug, { accessToken: j.access_token, refreshToken: j.refresh_token, expiresInSec: Number(j.expires_in) || 3600 });
 // Etsy access tokens are "{user_id}.{token}": the prefix is the user id.
 const userId = j.access_token.split(".")[0];
 await resolveShop(storeSlug, j.access_token, userId).catch(() => {});
 return true;
}

// A valid access token, refreshing if expired. Etsy rotates BOTH tokens on refresh.
async function accessToken(storeSlug: string): Promise<string | null> {
 const t = await getEtsyTokens(storeSlug);
 if (!t) return null;
 if (new Date(t.expiresAt).getTime() > Date.now() + 30_000) return t.accessToken;
 const res = await fetch(TOKEN, {
 method: "POST",
 headers: { "Content-Type": "application/x-www-form-urlencoded" },
 body: new URLSearchParams({ grant_type: "refresh_token", client_id: keystring(), refresh_token: t.refreshToken }),
 }).catch(() => null);
 const j = await res?.json().catch(() => null) as { access_token?: string; refresh_token?: string; expires_in?: number } | null;
 if (!j?.access_token || !j?.refresh_token) return null;
 await updateEtsyTokens(storeSlug, j.access_token, j.refresh_token, Number(j.expires_in) || 3600);
 return j.access_token;
}

export async function etsyConnected(storeSlug: string): Promise<boolean> {
 return !!(await getEtsyTokens(storeSlug));
}
export async function etsyStatus(storeSlug: string): Promise<{ configured: boolean; connected: boolean; shop: string | null }> {
 const t = await getEtsyTokens(storeSlug);
 return { configured: etsyConfigured(), connected: !!t, shop: t?.shopName ?? null };
}

async function etsyFetch(token: string, path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; json: unknown }> {
 const res = await fetch(`${API}${path}`, {
 ...init,
 headers: { "x-api-key": apiKey(), Authorization: `Bearer ${token}`, ...(init.headers || {}) },
 }).catch(() => null);
 if (!res) return { ok: false, status: 0, json: null };
 const json = await res.json().catch(() => null);
 return { ok: res.ok, status: res.status, json };
}

// Resolve the seller's shop id + name from the authenticated user, and cache it.
async function resolveShop(storeSlug: string, token: string, userId: string): Promise<{ shopId: string; shopName: string | null } | null> {
 // getShopByOwnerUserId: the shop owned by the authenticated user.
 const r = await etsyFetch(token, `/users/${userId}/shops`);
 const j = r.json as { shop_id?: number; shop_name?: string; results?: { shop_id: number; shop_name: string }[] } | null;
 const shop = j?.results?.[0] ?? (j?.shop_id ? { shop_id: j.shop_id, shop_name: j.shop_name || "" } : null);
 if (!shop?.shop_id) return null;
 await saveEtsyShop(storeSlug, String(shop.shop_id), shop.shop_name ?? null);
 return { shopId: String(shop.shop_id), shopName: shop.shop_name ?? null };
}

// Cache a valid clothing taxonomy node id (Etsy requires one on every listing).
let _taxonomyId: number | null = null;
async function clothingTaxonomyId(token: string): Promise<number | null> {
 if (_taxonomyId) return _taxonomyId;
 const r = await etsyFetch(token, `/seller-taxonomy/nodes`);
 const nodes = (r.json as { results?: { id: number; name: string }[] } | null)?.results ?? [];
 const match = nodes.find((n) => /cloth|accessor|jewelry|bag|shoe|vintage/i.test(n.name)) ?? nodes[0];
 _taxonomyId = match?.id ?? null;
 return _taxonomyId;
}

// Create an active Etsy listing for a piece (quantity 1) and attach its primary photo.
export async function listOnEtsy(storeSlug: string, item: EtsyItem): Promise<EtsyResult> {
 if (!etsyConfigured()) return { ok: false, error: "Etsy isn’t configured on the server." };
 const token = await accessToken(storeSlug);
 if (!token) return { ok: false, error: "Etsy isn’t connected. Reconnect the account." };
 const t = await getEtsyTokens(storeSlug);
 if (!t?.shopId) return { ok: false, error: "Couldn’t find your Etsy shop. Reconnect Etsy." };

 // Etsy needs a shipping profile on physical listings. Use the shop's first one.
 const sp = await etsyFetch(token, `/shops/${t.shopId}/shipping-profiles`);
 const shippingProfileId = (sp.json as { results?: { shipping_profile_id: number }[] } | null)?.results?.[0]?.shipping_profile_id;
 if (!shippingProfileId) return { ok: false, error: "Set up a shipping profile in your Etsy shop first. Etsy requires one to list." };
 const taxonomyId = await clothingTaxonomyId(token);
 if (!taxonomyId) return { ok: false, error: "Couldn’t resolve an Etsy category. Try reconnecting." };

 const create = await etsyFetch(token, `/shops/${t.shopId}/listings`, {
 method: "POST",
 headers: { "Content-Type": "application/x-www-form-urlencoded" },
 body: new URLSearchParams({
 quantity: "1",
 title: item.title.slice(0, 140),
 description: item.description || item.title,
 price: item.priceUsd.toFixed(2),
 who_made: "someone_else",
 when_made: "before_2004",
 taxonomy_id: String(taxonomyId),
 shipping_profile_id: String(shippingProfileId),
 type: "physical",
 state: "active",
 }),
 });
 const listing = create.json as { listing_id?: number } | null;
 if (!create.ok || !listing?.listing_id) return { ok: false, error: etsyErr(create.json) || "Couldn’t create the Etsy listing." };
 const listingId = String(listing.listing_id);

 // Attach the primary image (Etsy takes the file, not a URL).
 const primary = item.imageUrls[0];
 if (primary) await uploadImage(token, t.shopId, listingId, primary).catch(() => {});

 return { ok: true, listingId, listingUrl: `https://www.etsy.com/listing/${listingId}` };
}

async function uploadImage(token: string, shopId: string, listingId: string, imageUrl: string): Promise<void> {
 const img = await fetch(imageUrl).catch(() => null);
 if (!img?.ok) return;
 const buf = await img.arrayBuffer();
 const form = new FormData();
 form.append("image", new Blob([buf], { type: img.headers.get("content-type") || "image/jpeg" }), "photo.jpg");
 form.append("rank", "1");
 await fetch(`${API}/shops/${shopId}/listings/${listingId}/images`, {
 method: "POST",
 headers: { "x-api-key": apiKey(), Authorization: `Bearer ${token}` },
 body: form,
 }).catch(() => {});
}

// Deactivate (delist) an Etsy listing when the piece sells elsewhere. The one-of-one guarantee.
export async function endOnEtsy(storeSlug: string, listingUrlOrId: string): Promise<EtsyResult> {
 const token = await accessToken(storeSlug);
 if (!token) return { ok: false, error: "Etsy isn’t connected." };
 const t = await getEtsyTokens(storeSlug);
 if (!t?.shopId) return { ok: false, error: "No Etsy shop on file." };
 const m = String(listingUrlOrId).match(/(\d{6,})/);
 const listingId = m?.[1];
 if (!listingId) return { ok: false, error: "No Etsy listing id to delist." };
 const r = await etsyFetch(token, `/shops/${t.shopId}/listings/${listingId}`, {
 method: "PATCH",
 headers: { "Content-Type": "application/x-www-form-urlencoded" },
 body: new URLSearchParams({ state: "inactive" }),
 });
 return r.ok ? { ok: true, listingId } : { ok: false, error: etsyErr(r.json) || "Couldn’t deactivate the Etsy listing." };
}

function etsyErr(json: unknown): string | null {
 const j = json as { error?: string; error_description?: string; message?: string } | null;
 return j?.error_description || j?.error || j?.message || null;
}
