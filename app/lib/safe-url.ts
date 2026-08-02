import { lookup } from "dns/promises";

/**
 * SSRF guard for any server-side fetch of a user-supplied URL (store import, site capture).
 *
 * `safeUrl` is the cheap synchronous parse-level guard (scheme + obvious internal hosts). But a
 * public hostname pointed at an internal IP (DNS rebinding) or a redirect to one slips past parsing —
 * so the real defense is `assertPublicUrl` (resolves DNS + rejects private/reserved IPs) and
 * `safeFetch` (validates, then re-validates every redirect hop). Use those for untrusted URLs.
 */

export function safeUrl(raw: string): URL | null {
 let u: URL;
 try {
 u = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
 } catch {
 return null;
 }
 if (u.protocol !== "https:" && u.protocol !== "http:") return null;
 const h = u.hostname.toLowerCase();
 if (!h.includes(".")) return null; // no dot → not a public FQDN (localhost, single-label hosts)
 if (h === "localhost" || /\.(local|internal|lan|test|localhost)$/.test(h)) return null;
 if (h.includes(":")) return null; // IPv6 literal
 return u;
}

/** True for loopback / private / link-local / CGNAT / metadata / reserved addresses — anything that
 *  must never be reachable from a user-supplied URL. Handles IPv4, IPv6, and IPv4-mapped IPv6. */
export function isPrivateIp(ip: string): boolean {
 const addr = ip.toLowerCase().trim();

 // IPv4 (incl. the IPv4-mapped IPv6 form ::ffff:a.b.c.d)
 const v4 = addr.startsWith("::ffff:") ? addr.slice(7) : addr;
 const m = v4.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
 if (m) {
 if ([m[1], m[2], m[3], m[4]].some((o) => Number(o) > 255)) return true; // malformed → treat as unsafe
 const a = Number(m[1]), b = Number(m[2]), c = Number(m[3]);
 if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
 if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
 if (a === 172 && b >= 16 && b <= 31) return true; // private
 if (a === 192 && b === 168) return true; // private
 if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
 if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
 if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
 if (a >= 224) return true; // multicast + reserved
 return false;
 }

 // IPv6
 if (addr === "::1" || addr === "::") return true; // loopback / unspecified
 if (/^f[cd][0-9a-f]{2}:/.test(addr)) return true; // fc00::/7 unique-local
 if (/^fe[89ab][0-9a-f]:/.test(addr)) return true; // fe80::/10 link-local
 return false;
}

/** Parse + DNS-resolve a user URL; return it only if it's public and EVERY resolved address is
 *  public. Rejects DNS-rebinding to internal IPs, which parsing alone can't catch. Null = unsafe. */
export async function assertPublicUrl(raw: string): Promise<URL | null> {
 const u = safeUrl(raw);
 if (!u) return null;
 try {
 const addrs = await lookup(u.hostname, { all: true });
 if (!addrs.length) return null;
 if (addrs.some((a) => isPrivateIp(a.address))) return null;
 return u;
 } catch {
 return null; // can't resolve → can't verify → unsafe
 }
}

/** A fetch that is SSRF-safe end to end: validates the target, follows redirects MANUALLY, and
 *  re-validates each hop's host against DNS + private-IP rules. Throws on an unsafe target/hop. */
export async function safeFetch(rawUrl: string | URL, init?: RequestInit & { maxRedirects?: number }): Promise<Response> {
 const maxRedirects = init?.maxRedirects ?? 4;
 let current = String(rawUrl);
 for (let hop = 0; hop <= maxRedirects; hop++) {
 const u = await assertPublicUrl(current);
 if (!u) throw new Error("Blocked non-public URL (SSRF guard).");
 const res = await fetch(u.toString(), { ...init, redirect: "manual" });
 if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
 current = new URL(res.headers.get("location")!, u).toString(); // resolve relative, re-validate next loop
 continue;
 }
 return res;
 }
 throw new Error("Too many redirects (SSRF guard).");
}
