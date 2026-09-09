// The credential a call should use right now.
//
// Three cases, and the caller shouldn't have to know which: a store that signed in through Mailchimp
// (token never expires), one that signed in through Klaviyo (token expires hourly and is refreshed
// here, transparently), and one that pasted a key before signing in existed.
import { getEspConnection, updateEspToken, type EspConnection } from "./esp-db";
import { refreshRequest, expiryFrom, isExpired, authHeader } from "./esp-oauth";
import { mailchimpHost } from "./esp-core";

export type EspAuth = { headers: Record<string, string>; host: string | null } | null;

/** Refresh a Klaviyo token that's about to die. Returns the token to use, or null if it's beyond us. */
async function fresh(storeSlug: string, c: EspConnection): Promise<string | null> {
 if (!isExpired(c.tokenExpiresAt)) return c.accessToken;
 if (!c.refreshToken) return null;
 const id = process.env.KLAVIYO_CLIENT_ID, secret = process.env.KLAVIYO_CLIENT_SECRET;
 if (!id || !secret) return null;
 try {
  const r = refreshRequest({ clientId: id, clientSecret: secret, refreshToken: c.refreshToken });
  const res = await fetch(r.url, { method: "POST", headers: r.headers, body: r.body, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const d = await res.json();
  const token = String(d?.access_token || "");
  if (!token) return null;
  await updateEspToken(storeSlug, token, expiryFrom(d?.expires_in), d?.refresh_token ?? null);
  return token;
 } catch { return null; }
}

/**
 * Headers and API host for this store's connection.
 *
 * `host` is null for Klaviyo (one host for everyone) and the datacentre host for Mailchimp, which
 * differs per account — hence the metadata call when they first connect.
 */
export async function espAuth(storeSlug: string): Promise<{ conn: EspConnection; auth: EspAuth } | null> {
 const c = await getEspConnection(storeSlug);
 if (!c) return null;

 if (c.authKind === "oauth" && c.accessToken) {
  const token = c.provider === "klaviyo" ? await fresh(storeSlug, c) : c.accessToken;
  if (!token) return { conn: c, auth: null };
  const host = c.provider === "mailchimp"
   ? (c.serverPrefix ? `https://${c.serverPrefix}.api.mailchimp.com/3.0` : null)
   : null;
  return { conn: c, auth: { headers: authHeader(c.provider, token), host } };
 }

 // A pasted key, from before signing in existed. Still works; nobody is being made to redo it.
 if (!c.apiKey) return { conn: c, auth: null };
 const headers = c.provider === "klaviyo"
  ? { Authorization: `Klaviyo-API-Key ${c.apiKey}` }
  : { Authorization: `Basic ${Buffer.from(`anystring:${c.apiKey}`).toString("base64")}` };
 return { conn: c, auth: { headers, host: c.provider === "mailchimp" ? mailchimpHost(c.apiKey) : null } };
}
