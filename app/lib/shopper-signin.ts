/**
 * The link a shopper clicks to sign in to one seller's store.
 *
 * No password: a vintage shopper buying one dress will not create one, and a password they reuse is
 * a liability we would rather not hold. They type their email, we send a link, clicking it signs them
 * in — to that store only.
 *
 * Two properties matter, and both are about the fact that this token travels through email:
 *
 *  • IT IS NOT A SESSION. A link sits in an inbox for ever; a session lasts 90 days. They are signed
 *    with different purposes baked in, so a forwarded email cannot be replayed as a session cookie
 *    and a stolen cookie cannot be turned back into a sign-in link.
 *  • IT EXPIRES QUICKLY. Half an hour. Long enough to walk to a laptop, short enough that a forwarded
 *    or leaked email stops being a key.
 *
 * And like the session, it names the store it was issued for. Forwarding a sign-in email must not
 * hand someone an account at every store on the platform.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Half an hour. It is emailed, so it must not be a long-lived key. */
const LINK_TTL_MS = 30 * 60 * 1000;
/** Mixed into the signature so a link and a session can never be mistaken for each other. */
const PURPOSE = "shopper-signin";

export type SignInLink = { email: string; storeSlug: string; issuedAt: number; purpose: string };

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");
const normalise = (email: string) => (email || "").trim().toLowerCase();

function sign(payload: string, secret: string): string {
 return createHmac("sha256", `${PURPOSE}:${secret}`).update(payload).digest("base64url");
}

export function signInLinkToken(
 s: { email: string; storeSlug: string },
 secret: string,
 opts: { issuedAt?: number } = {},
): string {
 const body: SignInLink = {
  email: normalise(s.email),
  storeSlug: s.storeSlug,
  issuedAt: opts.issuedAt ?? Date.now(),
  purpose: PURPOSE,
 };
 const payload = b64(JSON.stringify(body));
 return `${payload}.${sign(payload, secret)}`;
}

/** Who this link signs in at THIS store, or null. */
export function readSignInLink(token: string, expectedStore: string, secret: string): SignInLink | null {
 try {
  const [payload, sig] = (token || "").split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload, secret);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const body = JSON.parse(unb64(payload)) as SignInLink;
  if (!body?.email || !body.storeSlug || body.purpose !== PURPOSE) return null;
  if (body.storeSlug !== expectedStore) return null;
  if (!Number.isFinite(body.issuedAt) || Date.now() - body.issuedAt > LINK_TTL_MS) return null;
  return { ...body, email: normalise(body.email) };
 } catch {
  return null;
 }
}
