import { createHmac, timingSafeEqual } from "crypto";

// Passwordless, PER-STORE buyer access. A signed token carries (store, email). The buyer's
// message inbox is looked up by that exact pair, so a token only ever exposes that one buyer's
// threads with that ONE store. Stores are never linked and never share a buyer identity — a
// buyer of Store A does not exist to Store B. No cross-store account, no customer-list bleed.

const SECRET =
 process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || process.env.MOBILE_AUTH_SECRET || process.env.ADMIN_PASSWORD || "";
const TOKEN_DAYS = 60;

function b64url(input: Buffer | string): string {
 return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Sign a store-scoped magic-link token for a buyer email. */
export function signBuyerToken(storeSlug: string, email: string): string {
 if (!SECRET) throw new Error("Auth secret not configured");
 const now = Math.floor(Date.now() / 1000);
 const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
 const payload = b64url(JSON.stringify({ s: storeSlug, e: email.toLowerCase(), iat: now, exp: now + TOKEN_DAYS * 86400 }));
 const data = `${header}.${payload}`;
 const sig = b64url(createHmac("sha256", SECRET).update(data).digest());
 return `${data}.${sig}`;
}

/** Verify a buyer token → { storeSlug, email } or null. */
export function verifyBuyerToken(token: string | null | undefined): { storeSlug: string; email: string } | null {
 if (!SECRET || !token) return null;
 const parts = token.split(".");
 if (parts.length !== 3) return null;
 const [h, p, s] = parts;
 const expected = b64url(createHmac("sha256", SECRET).update(`${h}.${p}`).digest());
 try {
 if (s.length !== expected.length || !timingSafeEqual(Buffer.from(s), Buffer.from(expected))) return null;
 const payload = JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
 if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) return null;
 if (typeof payload.s !== "string" || typeof payload.e !== "string") return null;
 return { storeSlug: payload.s, email: payload.e };
 } catch {
 return null;
 }
}
