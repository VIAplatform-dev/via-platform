import { createHmac, timingSafeEqual } from "crypto";

// A lightweight signed session for the consignor portal. HS256 over NEXTAUTH_SECRET, same
// secret the rest of auth uses. The session just carries the consignor's email; their data is
// looked up by that email, so a session only ever exposes the matching consignor's own statement.

const SECRET = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || process.env.MOBILE_AUTH_SECRET || "";
export const CONSIGNOR_COOKIE = "consignor_session";
const SESSION_DAYS = 30;

function b64url(input: Buffer | string): string {
 return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function signConsignorSession(email: string): string {
 if (!SECRET) throw new Error("Auth secret not configured");
 const header = { alg: "HS256", typ: "JWT" };
 const now = Math.floor(Date.now() / 1000);
 const payload = { email: email.toLowerCase(), iat: now, exp: now + SESSION_DAYS * 86400 };
 const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
 const sig = b64url(createHmac("sha256", SECRET).update(data).digest());
 return `${data}.${sig}`;
}

export function verifyConsignorSession(token: string): { email: string } | null {
 if (!SECRET || !token) return null;
 const parts = token.split(".");
 if (parts.length !== 3) return null;
 const [h, p, s] = parts;
 const expected = b64url(createHmac("sha256", SECRET).update(`${h}.${p}`).digest());
 try {
 if (s.length !== expected.length || !timingSafeEqual(Buffer.from(s), Buffer.from(expected))) return null;
 const payload = JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
 if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) return null;
 if (typeof payload.email !== "string") return null;
 return { email: payload.email };
 } catch {
 return null;
 }
}

/** The signed-in consignor's email from the session cookie, or null. */
export function getConsignorEmail(request: Request): string | null {
 const cookie = request.headers.get("cookie") || "";
 const m = cookie.match(new RegExp(`(?:^|; )${CONSIGNOR_COOKIE}=([^;]+)`));
 if (!m) return null;
 return verifyConsignorSession(decodeURIComponent(m[1]))?.email ?? null;
}
