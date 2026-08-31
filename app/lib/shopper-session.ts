/**
 * A shopper signed in on ONE seller's store.
 *
 * This is deliberately not the marketplace session. A shopper on sourcedbyscottie.getvya.ai is
 * Scottie's customer and nobody else's; they become a VYA member only by signing in on VYA itself.
 * That was decided on 2026-08-24 — hosted store shoppers are the seller's customers — and it is the
 * honest position on consent too: agreeing to hear from a vintage dealer in Georgetown is not
 * agreeing to hear from a marketplace.
 *
 * Two things keep the boundary:
 *
 *  1. THE BROWSER. Cookies are only shared with subdomains when something sets a `domain`, and
 *     nothing here does. A session made on `scottie.getvya.ai` is never sent to `getvya.ai`, so the
 *     separation costs nothing to maintain — which is exactly why it must not be given one. A single
 *     `domain` attribute would make every store recognise marketplace members and every seller's
 *     customers silently become VYA's, with no error and nothing failing. shopper-session.test.ts
 *     fails loudly if anyone adds it.
 *
 *  2. THE TOKEN ITSELF names the store it was issued for, and is refused anywhere else. So even if a
 *     cookie did leak across hosts, it would not sign anyone in.
 *
 * One email may hold customer records at several stores. Each seller sees only their own; the
 * cross-store view belongs to VYA (see listStoresForShopper), because showing Scottie that her buyer
 * also shops at four other vintage stores would hand her a competitor list built from other sellers'
 * customers — the same rule the Data Layer already runs on.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SHOPPER_COOKIE = "vya_store_session";
/** Long enough that a returning shopper is remembered; short enough that a shared device forgets. */
const MAX_AGE_DAYS = 90;

export type ShopperSession = { email: string; storeSlug: string; issuedAt: number };

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");
const normalise = (email: string) => (email || "").trim().toLowerCase();

function sign(payload: string, secret: string): string {
 return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** `<payload>.<signature>` — opaque to the browser, verifiable by us. */
export function signShopperToken(
 s: { email: string; storeSlug: string },
 secret: string,
 opts: { issuedAt?: number } = {},
): string {
 const body: ShopperSession = { email: normalise(s.email), storeSlug: s.storeSlug, issuedAt: opts.issuedAt ?? Date.now() };
 const payload = b64(JSON.stringify(body));
 return `${payload}.${sign(payload, secret)}`;
}

/**
 * The session this token represents at THIS store, or null.
 *
 * `expectedStore` is not optional on purpose: a caller that does not say which store it is serving
 * cannot be given a session, because the store is what the session is scoped to.
 */
export function readShopperToken(token: string, expectedStore: string, secret: string): ShopperSession | null {
 try {
  const [payload, sig] = (token || "").split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload, secret);
  // Constant-time: a length difference alone would leak whether a guess was close.
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const body = JSON.parse(unb64(payload)) as ShopperSession;
  if (!body?.email || !body.storeSlug) return null;
  // Issued for a different seller's store — refuse, whatever the signature says.
  if (body.storeSlug !== expectedStore) return null;
  if (!Number.isFinite(body.issuedAt) || Date.now() - body.issuedAt > MAX_AGE_DAYS * 24 * 3600 * 1000) return null;
  return { ...body, email: normalise(body.email) };
 } catch {
  return null;
 }
}

/**
 * How the cookie is set. NOTE THE ABSENCE OF `domain` — see the note at the top of this file. It is
 * asserted by a test, because losing it breaks the privacy boundary silently.
 */
export function shopperCookieOptions(): { httpOnly: true; sameSite: "lax"; secure: boolean; path: string; maxAge: number } {
 return {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_DAYS * 24 * 3600,
 };
}
