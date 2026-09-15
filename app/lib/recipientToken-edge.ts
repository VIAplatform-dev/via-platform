// Edge-Runtime-safe verification of the email `u=` recipient token. The middleware
// runs in the Edge Runtime, which has no Node `crypto`/`Buffer`, so it cannot use
// recipientToken.ts (Node). This reimplements verification with the Web Crypto API
// (crypto.subtle), producing the SAME HMAC-SHA256 signature, so tokens minted by
// makeRecipientToken (Node, in email building) verify correctly here.

function signingKey(): string {
 return process.env.EMAIL_LINK_SECRET || process.env.ADMIN_PASSWORD || "via-email-link";
}

async function sigEdge(payload: string): Promise<string> {
 const enc = new TextEncoder();
 const key = await crypto.subtle.importKey(
 "raw",
 enc.encode(signingKey()),
 { name: "HMAC", hash: "SHA-256" },
 false,
 ["sign"],
 );
 const buf = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
 const hex = Array.from(new Uint8Array(buf))
 .map((b) => b.toString(16).padStart(2, "0"))
 .join("");
 return hex.slice(0, 16); // matches the Node implementation's .slice(0, 16)
}

/** Verify a `u=` token; returns the recipient email, or null if invalid/forged. */
export async function verifyRecipientTokenEdge(
 token: string | null | undefined,
): Promise<string | null> {
 if (!token || !token.includes(".")) return null;
 const [payload, providedSig] = token.split(".");
 if (!payload || !providedSig) return null;

 const expected = await sigEdge(payload);
 if (providedSig.length !== expected.length) return null;

 // Constant-time-ish comparison.
 let diff = 0;
 for (let i = 0; i < expected.length; i++) {
 diff |= providedSig.charCodeAt(i) ^ expected.charCodeAt(i);
 }
 if (diff !== 0) return null;

 try {
 const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
 const email = atob(b64).toLowerCase().trim();
 return email.includes("@") ? email : null;
 } catch {
 return null;
 }
}
