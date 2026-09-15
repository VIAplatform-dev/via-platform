// Verifying that a webhook body really came from who it claims. Pure apart from WebCrypto.
//
// Lifted out of the route so it can be tested. A signature check that has never been run against a
// wrong signature is a signature check nobody knows the behaviour of, and this one guards an
// endpoint that writes debts against named stores.

import { timingSafeEqualStr } from "./safe-compare.ts";

/**
 * HMAC-SHA256 over the RAW body, compared constant-time against the header.
 *
 * The raw string, never a re-serialised object: JSON.stringify(JSON.parse(x)) is not x, and a
 * reordered key or a dropped space makes a valid signature fail.
 *
 * Providers spell the header differently. EasyPost sends `hmac-sha256-hex=<digest>`; others send
 * the bare digest. Anything after the last `=` is taken as the digest, and the comparison is
 * case-insensitive because hex has two spellings and neither is an attack.
 */
export async function verifyHmacSha256(raw: string, header: string | null | undefined, secret: string): Promise<boolean> {
 if (!header || !secret) return false;
 const h = String(header).trim();
 const given = (h.includes("=") ? h.slice(h.lastIndexOf("=") + 1) : h).trim().toLowerCase();
 if (!/^[0-9a-f]{64}$/.test(given)) return false; // not a SHA-256 hex digest, so not ours
 try {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return timingSafeEqualStr(Buffer.from(new Uint8Array(mac)).toString("hex"), given);
 } catch {
  return false;
 }
}

/**
 * Either proof: a signature over the body, or a secret carried in the URL.
 *
 * The token half exists because Shippo does not sign its webhooks at all, so the only thing that
 * distinguishes its posts from anybody else's is a secret in the subscription URL. It is weaker
 * than a signature (it is in logs, it does not cover the body) and it is what the provider offers.
 *
 * With NO secret configured this answers false, so an endpoint guarded by it is shut rather than
 * open. That is the direction to fail in: an unconfigured webhook that accepts everything is how a
 * stranger writes rows into your database.
 */
export async function webhookAuthorised(args: {
 raw: string;
 signatureHeader?: string | null;
 token?: string | null;
 secret?: string | null;
}): Promise<boolean> {
 const secret = String(args.secret ?? "").trim();
 if (!secret) return false;
 if (await verifyHmacSha256(args.raw, args.signatureHeader, secret)) return true;
 return timingSafeEqualStr(String(args.token ?? ""), secret);
}
