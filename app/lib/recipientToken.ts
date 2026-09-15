import crypto from "crypto";

// Per-recipient email link token. Emails embed `?u=<token>` in their links so that a
// click from an email, even logged out, even ending in a guest checkout. Can be tied
// back to the subscriber it was sent to. The token encodes the recipient's email and is
// HMAC-signed so it can't be forged to mis-attribute a click to someone else.
//
// Signing key: EMAIL_LINK_SECRET if set, else ADMIN_PASSWORD (already present in env).

function signingKey(): string {
 return process.env.EMAIL_LINK_SECRET || process.env.ADMIN_PASSWORD || "via-email-link";
}

function b64url(s: string): string {
 return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string): string {
 return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
function sig(payload: string): string {
 return crypto.createHmac("sha256", signingKey()).update(payload).digest("hex").slice(0, 16);
}

/** Build the `u=` token for an email recipient. Returns null if no email. */
export function makeRecipientToken(email: string | null | undefined): string | null {
 if (!email) return null;
 const payload = b64url(email.toLowerCase().trim());
 return `${payload}.${sig(payload)}`;
}

/** Verify a `u=` token and return the recipient email, or null if invalid/forged. */
export function verifyRecipientToken(token: string | null | undefined): string | null {
 if (!token || !token.includes(".")) return null;
 const [payload, providedSig] = token.split(".");
 if (!payload || !providedSig) return null;
 const expected = sig(payload);
 if (providedSig.length !== expected.length) return null;
 if (!crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expected))) return null;
 try {
  const email = unb64url(payload).toLowerCase().trim();
  return email.includes("@") ? email : null;
 } catch {
  return null;
 }
}
