/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDepopTokens, updateDepopAccessToken } from "./depop-tokens-db";

// Depop Selling API integration (partner-gated: apply via partner@depop.com). Mirrors the
// eBay cross-lister: connect account → create/update a listing (upsert by SKU = our
// itemId) → delete to pull it. Env-gated, so with no Depop app configured callers no-op.
//
// Two bits finalize when Depop sends partner onboarding (they're not in the public docs):
//  - the OAuth token/refresh URL (DEPOP_TOKEN_URL) and connect handshake
//  - the exact `condition` enum + a few attribute IDs (we map best-effort from taxonomy)
// Everything else here is built to the published Selling API + taxonomy docs.

const PARTNER_API = "https://partnerapi.depop.com";
const TAXONOMY_URL = "https://api.depop.com/api/v3/attributes/";

// Configured = we can talk to Depop at all. Partner credentials OR a seller session both count:
// the partner API was the original plan, the session is the route that actually works.
export function depopConfigured(): boolean {
 return !!(process.env.DEPOP_CLIENT_ID && process.env.DEPOP_CLIENT_SECRET) || process.env.DEPOP_SESSION_MODE === "1";
}

// ── Auth: bearer token OR captured session ───────────────────────────────────────────────────────
//
// The partner API authenticates with `Authorization: Bearer`. A session captured on the seller's
// phone authenticates with cookies instead — same seller, same account, different credential shape.
// Both land in the same `access_token` column, so this decides which it is by looking at the value.
//
// The heuristic, and why: a JWT is three base64 segments separated by dots and contains no "=" in
// the middle; a cookie header is `name=value; name=value`. So a "=" means cookie. It is a guess made
// deliberately loose because we have not yet seen a completed Depop login — once we have, this
// becomes a stored `kind` column rather than a sniff.
type DepopAuth = { kind: "session"; cookie: string } | { kind: "bearer"; token: string };

const looksLikeJwt = (v: string) => /^[\w-]+\.[\w-]+\.[\w-]+$/.test(v.trim());

async function depopAuth(storeSlug: string): Promise<DepopAuth | null> {
 const t = await getDepopTokens(storeSlug);
 if (!t?.accessToken) return null;
 const v = t.accessToken.trim();
 if (!looksLikeJwt(v) && v.includes("=")) return { kind: "session", cookie: v };
 const token = await accessToken(storeSlug);
 return token ? { kind: "bearer", token } : null;
}

/**
 * One request to Depop, authenticated however this seller is connected.
 *
 * A session is only accepted by Depop if the request also LOOKS like the browser it was born in —
 * a bare fetch with a Node user-agent gets the same Cloudflare 403 the server-side login got. So
 * session requests carry browser headers. This is not evasion: it is the seller's own live session,
 * presented the way the client that created it presents it.
 *
 * Returns the Response, or null if the request never completed.
 */
export async function depopFetch(storeSlug: string, url: string, init: RequestInit = {}): Promise<Response | null> {
 const auth = await depopAuth(storeSlug);
 if (!auth) return null;
 const headers: Record<string, string> = { Accept: "application/json", ...((init.headers as Record<string, string>) || {}) };
 if (auth.kind === "bearer") headers.Authorization = `Bearer ${auth.token}`;
 else {
  headers.Cookie = auth.cookie;
  headers["User-Agent"] = process.env.DEPOP_USER_AGENT || "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  headers["Accept-Language"] = "en-US,en;q=0.9";
 }
 return fetch(url, { ...init, headers, redirect: "follow" }).catch(() => null);
}

/** Which base a seller's requests go to — the partner API, or Depop's own, for a session. */
export async function depopApiBase(storeSlug: string): Promise<string> {
 const auth = await depopAuth(storeSlug);
 return auth?.kind === "session" ? (process.env.DEPOP_WEB_API || "https://webapi.depop.com") : PARTNER_API;
}

// A valid per-seller access token, refreshing via OAuth if we have a refresh token +
// token URL. Returns null if the seller hasn't connected Depop.
async function accessToken(storeSlug: string): Promise<string | null> {
 const t = await getDepopTokens(storeSlug);
 if (!t) return null;
 if (!t.expiresAt || new Date(t.expiresAt).getTime() > Date.now()) return t.accessToken;
 const tokenUrl = process.env.DEPOP_TOKEN_URL;
 if (!t.refreshToken || !tokenUrl) return t.accessToken; // best effort — may still be valid
 const res = await fetch(tokenUrl, {
 method: "POST",
 headers: { "Content-Type": "application/x-www-form-urlencoded" },
 body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refreshToken, client_id: process.env.DEPOP_CLIENT_ID || "", client_secret: process.env.DEPOP_CLIENT_SECRET || "" }),
 }).catch(() => null);
 if (!res || !res.ok) return t.accessToken;
 const j = await res.json().catch(() => null);
 if (!j?.access_token) return t.accessToken;
 await updateDepopAccessToken(storeSlug, j.access_token, Number(j.expires_in) || 3600);
 return j.access_token;
}

export async function depopConnected(storeSlug: string): Promise<boolean> {
 return !!(await getDepopTokens(storeSlug));
}

// --- Taxonomy (cached ~1h) ------------------------------------------------------------
let taxonomyCache: { at: number; data: any } | null = null;
async function taxonomy(): Promise<any | null> {
 if (taxonomyCache && Date.now() - taxonomyCache.at < 3600_000) return taxonomyCache.data;
 const res = await fetch(TAXONOMY_URL, { headers: { "User-Agent": "Partner" } }).catch(() => null);
 if (!res || !res.ok) return taxonomyCache?.data ?? null;
 const data = await res.json().catch(() => null);
 if (data) taxonomyCache = { at: Date.now(), data };
 return data;
}

const lc = (s: string) => (s || "").toLowerCase();

// Map our category/size onto Depop's department + product_type + size_set_id/size_id.
async function resolveCategory(item: DepopItem): Promise<{ department: string; product_type?: string; size_set_id?: string; size_id?: string }> {
 const tax = await taxonomy();
 const cat = lc(item.category || "");
 // Department: infer from category keywords; default womenswear (largest on Depop).
 const department = /men|guy|male/.test(cat) && !/women/.test(cat) ? "menswear" : "womenswear";
 if (!tax) return { department };

 // Product type: first group whose name matches a word in our category.
 const groups: any[] = Array.isArray(tax.group) ? tax.group : Object.values(tax.group || {});
 const pt = groups.find((g: any) => cat && lc(g?.name || g?.slug || "").split(/\W+/).some((w: string) => w && cat.includes(w)));
 const product_type = pt?.id || pt?.slug || undefined;

 // Size: find the US size_set for this dept/product_type, then the matching size_id.
 let size_set_id: string | undefined, size_id: string | undefined;
 if (item.size && product_type) {
 const mapping: any[] = Array.isArray(tax.category_size_mapping) ? tax.category_size_mapping : Object.values(tax.category_size_mapping || {});
 const m = mapping.find((x: any) => (x?.product_type === product_type || x?.group === product_type) && /us/i.test(x?.region || x?.regions || "US"));
 size_set_id = m?.size_set_id;
 const sets: any = tax.size_sets || {};
 const set = size_set_id ? (Array.isArray(sets) ? sets.find((s: any) => s.size_set_id === size_set_id) : sets[size_set_id]) : null;
 const sizes: any[] = set?.sizes || set || [];
 const hit = Array.isArray(sizes) ? sizes.find((s: any) => lc(s?.name || s?.label || "") === lc(item.size!)) : null;
 size_id = hit?.size_id;
 }
 return { department, product_type, size_set_id, size_id };
}

const CONDITION_MAP: Record<string, string> = {
 new: "brand_new", "brand new": "brand_new", "like new": "used_like_new", excellent: "used_excellent",
 "very good": "used_very_good", good: "used_good", fair: "used_fair", vintage: "used_good",
};

export type DepopItem = { itemId: string; title: string; description?: string | null; brand?: string | null; condition?: string | null; size?: string | null; category?: string | null; colour?: string | null; priceCents: number; currency?: string; images: string[] };
export type DepopResult = { ok: boolean; listingUrl?: string; error?: string };

// Create/update a Depop listing (PUT upsert by SKU). Returns the listing URL.
export async function listOnDepop(storeSlug: string, item: DepopItem): Promise<DepopResult> {
 if (!depopConfigured()) return { ok: false, error: "Depop isn’t configured on the server." };
 const token = await accessToken(storeSlug);
 if (!token) return { ok: false, error: "Depop isn’t connected — reconnect the account." };
 const images = (item.images || []).filter((u) => /^https?:\/\//.test(u)).slice(0, 8);
 if (!images.length) return { ok: false, error: "Depop needs at least one hosted image." };

 const cat = await resolveCategory(item);
 const pictures = images.map((url, i) => ({ url: i === 0 ? `${url}#type=cover-image` : url }));
 const body: Record<string, any> = {
 description: `${item.brand ? item.brand + " — " : ""}${item.title}${item.description ? "\n\n" + item.description : ""}`.slice(0, 1000),
 price_currency: item.currency || "USD",
 price_amount: (item.priceCents / 100).toFixed(2),
 national_shipping_cost: "0.00",
 quantity: 1,
 department: cat.department,
 ...(cat.product_type ? { product_type: cat.product_type } : {}),
 ...(cat.size_set_id ? { size_set_id: cat.size_set_id } : {}),
 ...(cat.size_id ? { size_id: cat.size_id } : {}),
 condition: CONDITION_MAP[lc(item.condition || "")] || "used_good",
 ...(item.brand ? { brand: item.brand } : {}),
 ...(item.colour ? { colour: item.colour } : {}),
 pictures,
 };

 const res = await fetch(`${PARTNER_API}/api/v1/products/${encodeURIComponent(item.itemId)}`, {
 method: "PUT",
 headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
 body: JSON.stringify(body),
 }).catch(() => null);
 if (!res) return { ok: false, error: "Couldn’t reach Depop." };
 const j = await res.json().catch(() => null);
 if (!res.ok) return { ok: false, error: `Depop: ${j?.error?.message || j?.message || res.status}` };
 const slug = j?.slug || j?.product?.slug || item.itemId;
 return { ok: true, listingUrl: `https://www.depop.com/products/${slug}` };
}

// ── Sold-sync read ───────────────────────────────────────────────────────────────────────────────
export type DepopSale = { sku: string; orderId: string; soldPriceCents: number };
export type DepopSoldResult = { sales: DepopSale[]; status: "ok" | "unmapped" | "unauthorized" | "error"; detail?: string };

/**
 * Recent Depop sales for one store.
 *
 * THE ENDPOINT IS NOT HARDCODED, ON PURPOSE. Depop's partner API is closed to us and its own web API
 * is undocumented — we have never completed a login, so we have never seen a sold-items response.
 * Writing a plausible URL here would produce code that looks finished, returns nothing, and gives no
 * clue why. So the path comes from DEPOP_SOLD_PATH and, unset, this reports `unmapped` rather than
 * an empty list: the cron then says "not mapped yet" instead of "no sales", which are very different
 * facts. Point the probe route at a live session, read the real shape, set the env var.
 *
 * The parse is deliberately tolerant for the same reason — several plausible key names for the same
 * field, so the first real response has a good chance of being understood without a code change.
 */
export async function getRecentDepopSoldSkus(storeSlug: string, sinceIso: string): Promise<DepopSoldResult> {
 const path = process.env.DEPOP_SOLD_PATH;
 if (!path) return { sales: [], status: "unmapped", detail: "DEPOP_SOLD_PATH is not set — the sold-items endpoint hasn't been mapped yet." };

 const base = await depopApiBase(storeSlug);
 const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
 const res = await depopFetch(storeSlug, url.replace("{since}", encodeURIComponent(sinceIso)));
 if (!res) return { sales: [], status: "error", detail: "Couldn't reach Depop." };
 if (res.status === 401 || res.status === 403) return { sales: [], status: "unauthorized", detail: `Depop rejected the session (${res.status}).` };
 if (!res.ok) return { sales: [], status: "error", detail: `Depop returned ${res.status}.` };

 const j: any = await res.json().catch(() => null);
 if (!j) return { sales: [], status: "error", detail: "Depop returned a body we couldn't parse as JSON." };

 // Find the list wherever it lives, then read each row tolerantly.
 const rows: any[] = Array.isArray(j) ? j : (j.results || j.products || j.items || j.orders || j.data || []);
 const since = new Date(sinceIso).getTime();
 const sales: DepopSale[] = [];
 for (const r of Array.isArray(rows) ? rows : []) {
  // The SKU is our itemId — whatever we set when the listing was created.
  const sku = String(r?.sku ?? r?.external_id ?? r?.reference ?? r?.seller_sku ?? "").trim();
  if (!sku) continue;
  const soldAt = r?.sold_at ?? r?.date_sold ?? r?.updated_at ?? r?.created_at;
  const t = soldAt ? new Date(soldAt).getTime() : NaN;
  if (!Number.isNaN(t) && t < since) continue; // older than the window
  const priceRaw = r?.sold_price?.amount ?? r?.price?.amount ?? r?.price_amount ?? r?.price;
  const soldPriceCents = Math.round(Number(priceRaw || 0) * (String(priceRaw).includes(".") || Number(priceRaw) < 1000 ? 100 : 1)) || 0;
  sales.push({ sku, orderId: String(r?.id ?? r?.order_id ?? r?.transaction_id ?? sku), soldPriceCents });
 }
 return { sales, status: "ok" };
}

// Pull a Depop listing (delete by SKU) — used when it sells elsewhere.
export async function endOnDepop(storeSlug: string, itemId: string): Promise<boolean> {
 if (!depopConfigured()) return false;
 const token = await accessToken(storeSlug);
 if (!token) return false;
 const res = await fetch(`${PARTNER_API}/api/v1/products/${encodeURIComponent(itemId)}`, {
 method: "DELETE",
 headers: { Authorization: `Bearer ${token}` },
 }).catch(() => null);
 return !!res && res.ok;
}
