// ───────────────────────────────────────────────────────────────────────────
// Minimal Stripe REST helper. The codebase talks to Stripe over the raw REST API
// (form-encoded) rather than the SDK; this centralises that. Stripe expects
// bracket notation for nested params, e.g. capabilities[transfers][requested]=true.
// ───────────────────────────────────────────────────────────────────────────

const STRIPE_API = "https://api.stripe.com/v1";

function secretKey(): string {
 const k = process.env.STRIPE_SECRET_KEY?.trim();
 if (!k) throw new Error("STRIPE_SECRET_KEY is not set");
 return k;
}

export function stripeConfigured(): boolean {
 return Boolean(process.env.STRIPE_SECRET_KEY);
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Flatten nested objects into Stripe's bracketed form-encoding. */
function flatten(params: Record<string, any>, prefix = ""): [string, string][] {
 const out: [string, string][] = [];
 for (const [k, v] of Object.entries(params)) {
 if (v === undefined || v === null) continue;
 const key = prefix ? `${prefix}[${k}]` : k;
 if (typeof v === "object" && !Array.isArray(v)) out.push(...flatten(v, key));
 else out.push([key, String(v)]);
 }
 return out;
}

async function request(method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, any>, stripeAccount?: string, idempotencyKey?: string): Promise<any> {
 const encoded = params ? new URLSearchParams(flatten(params)).toString() : "";
 const url = method === "GET" && encoded ? `${STRIPE_API}/${path}?${encoded}` : `${STRIPE_API}/${path}`;
 const res = await fetch(url, {
 method,
 headers: {
 Authorization: `Bearer ${secretKey()}`,
 "Content-Type": "application/x-www-form-urlencoded",
 // Acting on a connected account = a direct charge on the seller (merchant of record).
 ...(stripeAccount ? { "Stripe-Account": stripeAccount } : {}),
 // Idempotency-Key makes a POST safe to retry — Stripe returns the SAME result instead of a
 // second charge/transfer/refund. Pass a STABLE key per logical action on any money-moving call.
 ...(idempotencyKey && method === "POST" ? { "Idempotency-Key": idempotencyKey } : {}),
 },
 body: method !== "GET" ? encoded : undefined,
 });
 const json = await res.json();
 if (!res.ok) throw new Error(json?.error?.message || `Stripe error ${res.status}`);
 return json;
}

export const stripePost = (path: string, params?: Record<string, any>, stripeAccount?: string, idempotencyKey?: string) => request("POST", path, params, stripeAccount, idempotencyKey);
export const stripeGet = (path: string, params?: Record<string, any>, stripeAccount?: string) => request("GET", path, params, stripeAccount);
export const stripeDelete = (path: string) => request("DELETE", path);

// Countries we'll ship to. Stripe requires an explicit allow-list; objects with
// numeric keys flatten to allowed_countries[0]=US&allowed_countries[1]=CA…
const SHIP_COUNTRIES = ["US", "CA", "GB", "AU", "FR", "DE", "IT", "ES", "NL", "IE", "NZ", "JP", "SE", "DK", "NO", "BE", "AT", "CH", "FI", "PT"];

/** Stripe Checkout params to natively collect the buyer's shipping address + phone.
 * (Email is always collected by Checkout.) Spread into the session create call. */
export function checkoutCollection(): Record<string, any> {
 const allowed: Record<number, string> = {};
 SHIP_COUNTRIES.forEach((c, i) => (allowed[i] = c));
 return {
 shipping_address_collection: { allowed_countries: allowed },
 phone_number_collection: { enabled: true },
 };
}
