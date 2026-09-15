// ───────────────────────────────────────────────────────────────────────────
// One-click "Connect with Shopify" (OAuth). The seller clicks Connect, approves
// on Shopify, and we exchange the code for an Admin API access token, no tokens
// or dev-dashboard steps for the seller. The token then drives the Admin API
// import (shopify-admin.ts). Configured via SHOPIFY_CLIENT_ID / _SECRET (the app's
// Client ID + secret from the Dev Dashboard → Settings).
// ───────────────────────────────────────────────────────────────────────────
import crypto from "crypto";

const SCOPES = "read_products,read_content";

export function isShopifyOAuthConfigured(): boolean {
 return Boolean(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET);
}

/** Normalize a seller's input to a my-shopify domain (OAuth requires it). */
export function normalizeShop(input: string): string | null {
 let s = (input || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
 if (!s) return null;
 if (!s.includes(".")) s = `${s}.myshopify.com`;
 return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s) ? s : null;
}

const secret = () => process.env.SHOPIFY_CLIENT_SECRET || "";

export function signState(payload: Record<string, unknown>): string {
 const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
 const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
 return `${body}.${sig}`;
}

export function verifyState(state: string): Record<string, string> | null {
 const [body, sig] = (state || "").split(".");
 if (!body || !sig) return null;
 const expect = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
 try {
 if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
 return JSON.parse(Buffer.from(body, "base64url").toString());
 } catch {
 return null;
 }
}

export function buildAuthUrl(shop: string, state: string, redirectUri: string): string {
 const p = new URLSearchParams({ client_id: process.env.SHOPIFY_CLIENT_ID || "", scope: SCOPES, redirect_uri: redirectUri, state });
 return `https://${shop}/admin/oauth/authorize?${p.toString()}`;
}

/** Verify the HMAC Shopify signs the callback query with (anti-tamper). */
export function verifyCallbackHmac(params: URLSearchParams): boolean {
 const hmac = params.get("hmac") || "";
 const parts: string[] = [];
 params.forEach((v, k) => { if (k !== "hmac" && k !== "signature") parts.push(`${k}=${v}`); });
 parts.sort();
 const digest = crypto.createHmac("sha256", secret()).update(parts.join("&")).digest("hex");
 try {
 return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
 } catch {
 return false;
 }
}

/** Exchange the OAuth code for a permanent Admin API access token. */
export async function exchangeCodeForToken(shop: string, code: string): Promise<string | null> {
 const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET, code }),
 signal: AbortSignal.timeout(15000),
 });
 if (!res.ok) return null;
 const j = await res.json().catch(() => ({}));
 return j.access_token || null;
}
