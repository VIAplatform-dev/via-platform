import { quantile } from "./metrics";

// ───────────────────────────────────────────────────────────────────────────
// Data Layer — eBay comps (external price + competition signal).
//
// Uses the open Browse API (active listings → asking-price band + how many are
// listed) via an app OAuth token. Graceful: with no EBAY_CLIENT_ID/SECRET it
// returns null and the rest of the system simply runs on VYA data alone.
//
// Sold comps (Marketplace Insights, approval-gated) slot in later as
// `soldPer30d` — the blended verdict already handles it.
// ───────────────────────────────────────────────────────────────────────────

const OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";

export function isEbayConfigured(): boolean {
 return !!process.env.EBAY_CLIENT_ID && !!process.env.EBAY_CLIENT_SECRET;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getEbayToken(): Promise<string | null> {
 const id = process.env.EBAY_CLIENT_ID;
 const secret = process.env.EBAY_CLIENT_SECRET;
 if (!id || !secret) return null;
 if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

 const basic = Buffer.from(`${id}:${secret}`).toString("base64");
 const res = await fetch(OAUTH_URL, {
 method: "POST",
 headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
 body: "grant_type=client_credentials&scope=" + encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
 });
 if (!res.ok) {
 console.error("[ebay] token error", res.status, await res.text().catch(() => ""));
 return null;
 }
 const data = (await res.json()) as { access_token: string; expires_in: number };
 cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000 };
 return cachedToken.token;
}

export type EbayComps = {
 query: string;
 medianPrice: number | null;
 p25: number | null;
 p75: number | null;
 activeCount: number | null; // total active listings matching = competition
 sampleSize: number; // how many prices we actually averaged
 currency: string;
 soldPer30d?: number | null; // filled when Marketplace Insights is enabled
};

// Raw title+price for the active listings of a query — the input to sub-market clustering.
// (searchComps discards titles; this keeps them so a wide brand can be split into real segments.)
export async function searchListings(query: string, limit = 50): Promise<{ title: string; price: number }[]> {
 const token = await getEbayToken();
 if (!token) return [];
 try {
 const url = `${BROWSE_URL}?q=${encodeURIComponent(query)}&limit=${limit}&filter=${encodeURIComponent("buyingOptions:{FIXED_PRICE}")}`;
 const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" } });
 if (!res.ok) return [];
 const data = (await res.json()) as { itemSummaries?: Array<{ title?: string; price?: { value?: string } }> };
 const out: { title: string; price: number }[] = [];
 for (const it of data.itemSummaries ?? []) {
  const v = it.price?.value ? parseFloat(it.price.value) : NaN;
  if (it.title && Number.isFinite(v) && v > 0) out.push({ title: it.title, price: v });
 }
 return out;
 } catch { return []; }
}

// A single active listing with the fields a sourcing / flip-finder needs (URL to buy, image,
// condition, seller) — searchListings/searchComps drop these.
export type DetailedListing = {
 itemId: string;
 title: string;
 price: number;
 currency: string;
 image: string | null;
 url: string;
 condition: string | null;
 seller: string | null;
};
type BrowseItem = {
 itemId?: string; title?: string;
 price?: { value?: string; currency?: string };
 image?: { imageUrl?: string }; thumbnailImages?: Array<{ imageUrl?: string }>;
 itemWebUrl?: string; condition?: string; seller?: { username?: string };
};
export async function searchListingsDetailed(query: string, limit = 50): Promise<DetailedListing[]> {
 const token = await getEbayToken();
 if (!token) return [];
 try {
 const url = `${BROWSE_URL}?q=${encodeURIComponent(query)}&limit=${Math.min(200, limit)}&filter=${encodeURIComponent("buyingOptions:{FIXED_PRICE}")}`;
 const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" } });
 if (!res.ok) return [];
 const data = (await res.json()) as { itemSummaries?: BrowseItem[] };
 const out: DetailedListing[] = [];
 for (const it of data.itemSummaries ?? []) {
  const v = it.price?.value ? parseFloat(it.price.value) : NaN;
  if (!(Number.isFinite(v) && v > 0) || !it.title) continue;
  out.push({
   itemId: String(it.itemId ?? ""),
   title: String(it.title),
   price: v,
   currency: String(it.price?.currency ?? "USD"),
   image: it.image?.imageUrl ?? it.thumbnailImages?.[0]?.imageUrl ?? null,
   url: String(it.itemWebUrl ?? ""),
   condition: it.condition ? String(it.condition) : null,
   seller: it.seller?.username ? String(it.seller.username) : null,
  });
 }
 return out;
 } catch { return []; }
}

// Active-listing comps for a query. Returns null if not configured or on error.
export async function searchComps(query: string): Promise<EbayComps | null> {
 const token = await getEbayToken();
 if (!token) return null;
 try {
 const url = `${BROWSE_URL}?q=${encodeURIComponent(query)}&limit=50&filter=${encodeURIComponent("buyingOptions:{FIXED_PRICE}")}`;
 const res = await fetch(url, {
 headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
 });
 if (!res.ok) {
 console.error("[ebay] browse error", res.status, await res.text().catch(() => ""));
 return null;
 }
 const data = (await res.json()) as {
 total?: number;
 itemSummaries?: Array<{ price?: { value?: string; currency?: string } }>;
 };
 const prices: number[] = [];
 let currency = "USD";
 for (const it of data.itemSummaries ?? []) {
 const v = it.price?.value ? parseFloat(it.price.value) : NaN;
 if (Number.isFinite(v) && v > 0) prices.push(v);
 if (it.price?.currency) currency = it.price.currency;
 }
 const round2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
 return {
 query,
 medianPrice: round2(quantile(prices, 0.5)),
 p25: round2(quantile(prices, 0.25)),
 p75: round2(quantile(prices, 0.75)),
 activeCount: data.total ?? null,
 sampleSize: prices.length,
 currency,
 };
 } catch (err) {
 console.error("[ebay] searchComps failed", err);
 return null;
 }
}
