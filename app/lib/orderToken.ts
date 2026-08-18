import crypto from "crypto";

// Opaque, unguessable token for a buyer's order-status page (/order/[token]). HMAC-signed so the raw
// order id is never exposed and the URL can't be enumerated or forged. Same signing key as the email
// recipient token. Buyer-facing links (confirmation + tracking emails, the success page) use this.

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
 return crypto.createHmac("sha256", signingKey()).update(payload).digest("hex").slice(0, 20);
}

/** Signed token for an order id. */
export function makeOrderToken(orderId: string | null | undefined): string | null {
 if (!orderId) return null;
 const payload = b64url(String(orderId));
 return `${payload}.${sig(payload)}`;
}

/** Verify an order token → order id, or null if invalid/forged. */
export function verifyOrderToken(token: string | null | undefined): string | null {
 if (!token || !token.includes(".")) return null;
 const [payload, providedSig] = token.split(".");
 if (!payload || !providedSig) return null;
 const expected = sig(payload);
 if (providedSig.length !== expected.length) return null;
 if (!crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expected))) return null;
 try {
 const id = unb64url(payload);
 return id || null;
 } catch {
 return null;
 }
}
