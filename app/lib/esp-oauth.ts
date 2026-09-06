// ───────────────────────────────────────────────────────────────────────────
// "Connect Mailchimp" — the button, not the API key.
//
// A shop owner does not have an API key and should never be asked for one. The flow they know from
// Shopify is: press Connect, land on Mailchimp's own login, press Allow, come back connected. That's
// OAuth, and it's also safer — VYA never sees their password, the access can be revoked from their
// side, and we hold a token scoped to the few things we actually do.
//
// The two providers are genuinely different and the differences are load-bearing:
//
//  MAILCHIMP  no PKCE. The token NEVER EXPIRES, so there's no refresh to run. After the exchange you
//             must call their metadata endpoint to learn the account's datacentre ("us21") — the API
//             host is built from it, and without that call you don't know where to send anything.
//             Calls are authorised with `Authorization: OAuth <token>` — not Bearer.
//
//  KLAVIYO    PKCE is required (S256). The token exchange authenticates with HTTP Basic, not body
//             params. Access tokens last about an hour and must be refreshed; refresh tokens die
//             after 90 days unused. Calls use `Authorization: Bearer <token>`. `accounts:read` must
//             stay in the scope list — they require it.
//
// Pure — no network, no database. Every value that goes into a URL is built here so it can be tested.
// Sources: mailchimp.com/developer/marketing/guides/access-user-data-oauth-2 and
// developers.klaviyo.com/en/docs/set_up_oauth
// ───────────────────────────────────────────────────────────────────────────

import { createHash, randomBytes } from "crypto";
import type { EspProvider } from "./esp-core";

export const MAILCHIMP_AUTHORIZE = "https://login.mailchimp.com/oauth2/authorize";
export const MAILCHIMP_TOKEN = "https://login.mailchimp.com/oauth2/token";
export const MAILCHIMP_METADATA = "https://login.mailchimp.com/oauth2/metadata";
export const KLAVIYO_AUTHORIZE = "https://www.klaviyo.com/oauth/authorize";
// Their token traffic must go to a.klaviyo.com — www stopped accepting it in March 2025.
export const KLAVIYO_TOKEN = "https://a.klaviyo.com/oauth/token";

/** The least we can ask for and still do the job: read the account, read lists, write profiles. */
export const KLAVIYO_SCOPES = ["accounts:read", "lists:read", "lists:write", "profiles:read", "profiles:write"];

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** PKCE. Klaviyo requires it; the verifier stays with us and proves the code came back to the same place. */
export function makePkce(): { verifier: string; challenge: string } {
 // 43–128 characters, per the spec. 32 random bytes base64url is 43.
 const verifier = b64url(randomBytes(32));
 const challenge = b64url(createHash("sha256").update(verifier).digest());
 return { verifier, challenge };
}

export function makeState(): string {
 return b64url(randomBytes(24));
}

/**
 * The site's address, in a form that can actually go in a URL.
 *
 * The environment doesn't promise a scheme — NEXT_PUBLIC_BASE_URL is set to "vyaplatform.com" here —
 * and a redirect_uri without one is refused by both providers with an unhelpful error. localhost
 * keeps http, since that's what a dev server serves.
 */
export function espBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
 const raw = String(env.ESP_BASE_URL || env.NEXT_PUBLIC_BASE_URL || env.BASE_URL || "https://getvya.ai").trim().replace(/^["']|["']$/g, "");
 const bare = raw.replace(/\/+$/, "");
 if (/^https?:\/\//i.test(bare)) return bare;
 return `${/^localhost|^127\.0\.0\.1/.test(bare) ? "http" : "https"}://${bare}`;
}

export function redirectUri(baseUrl: string, provider: EspProvider): string {
 return `${baseUrl.replace(/\/+$/, "")}/api/store/marketing/esp/callback/${provider}`;
}

/**
 * Where to send the seller.
 *
 * `state` is carried through and checked on the way back: without it, someone could hand a store a
 * link that connects THEIR Mailchimp to the store's VYA account.
 */
export function authorizeUrl(o: {
 provider: EspProvider; clientId: string; baseUrl: string; state: string; challenge?: string;
}): string {
 const redirect = redirectUri(o.baseUrl, o.provider);
 if (o.provider === "mailchimp") {
  const q = new URLSearchParams({ response_type: "code", client_id: o.clientId, redirect_uri: redirect, state: o.state });
  return `${MAILCHIMP_AUTHORIZE}?${q}`;
 }
 const q = new URLSearchParams({
  response_type: "code",
  client_id: o.clientId,
  redirect_uri: redirect,
  scope: KLAVIYO_SCOPES.join(" "),
  state: o.state,
  code_challenge_method: "S256",
  code_challenge: o.challenge || "",
 });
 return `${KLAVIYO_AUTHORIZE}?${q}`;
}

export type TokenRequest = { url: string; headers: Record<string, string>; body: string };

/**
 * The code-for-token exchange, shaped per provider.
 *
 * Mailchimp takes the client secret in the BODY. Klaviyo takes it as HTTP Basic and refuses it in
 * the body. Sending either one the other way is a 401 with nothing useful in it.
 */
export function tokenRequest(o: {
 provider: EspProvider; clientId: string; clientSecret: string; code: string; baseUrl: string; verifier?: string;
}): TokenRequest {
 const redirect = redirectUri(o.baseUrl, o.provider);
 if (o.provider === "mailchimp") {
  return {
   url: MAILCHIMP_TOKEN,
   headers: { "content-type": "application/x-www-form-urlencoded" },
   body: new URLSearchParams({
    grant_type: "authorization_code",
    client_id: o.clientId,
    client_secret: o.clientSecret,
    redirect_uri: redirect,
    code: o.code,
   }).toString(),
  };
 }
 return {
  url: KLAVIYO_TOKEN,
  headers: {
   Authorization: `Basic ${Buffer.from(`${o.clientId}:${o.clientSecret}`).toString("base64")}`,
   "content-type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({
   grant_type: "authorization_code",
   code: o.code,
   code_verifier: o.verifier || "",
   redirect_uri: redirect,
  }).toString(),
 };
}

/** Klaviyo only. Mailchimp tokens don't expire, so there is nothing to refresh. */
export function refreshRequest(o: { clientId: string; clientSecret: string; refreshToken: string }): TokenRequest {
 return {
  url: KLAVIYO_TOKEN,
  headers: {
   Authorization: `Basic ${Buffer.from(`${o.clientId}:${o.clientSecret}`).toString("base64")}`,
   "content-type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: o.refreshToken }).toString(),
 };
}

/** When a token bought now runs out. A minute of slack, so a call never starts on an expiring token. */
export function expiryFrom(expiresIn: unknown, now = Date.now()): string | null {
 const secs = Number(expiresIn);
 if (!Number.isFinite(secs) || secs <= 0) return null;
 return new Date(now + (secs - 60) * 1000).toISOString();
}

export function isExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
 if (!expiresAt) return false; // no expiry recorded → Mailchimp, which never expires
 const t = Date.parse(expiresAt);
 return !Number.isFinite(t) || t <= now;
}

/** How each provider wants its access token presented. Mailchimp is NOT Bearer. */
export function authHeader(provider: EspProvider, token: string): Record<string, string> {
 return { Authorization: provider === "mailchimp" ? `OAuth ${token}` : `Bearer ${token}` };
}

/** Whether VYA itself is set up to offer this. Missing credentials is our problem, not the seller's. */
export function oauthConfigured(provider: EspProvider): boolean {
 return provider === "mailchimp"
  ? Boolean(process.env.MAILCHIMP_CLIENT_ID && process.env.MAILCHIMP_CLIENT_SECRET)
  : Boolean(process.env.KLAVIYO_CLIENT_ID && process.env.KLAVIYO_CLIENT_SECRET);
}
