/**
 * Basic SSRF guard for any server-side fetch of a user-supplied URL (store import, site capture).
 * Rejects anything that isn't a plain PUBLIC web host: no localhost, internal TLDs, bare IPs (which
 * covers cloud-metadata 169.254.169.254 and private ranges), IPv6 literals, or non-http(s) schemes.
 *
 * Note: this does NOT resolve DNS, so a public hostname pointed at an internal IP (DNS rebinding) can
 * still slip through — a known residual gap. It's the cheap 90% guard; harden with DNS resolution if
 * this ever fetches truly untrusted URLs.
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
 if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return null; // bare IPv4 (blocks metadata + private ranges)
 if (h.includes(":")) return null; // IPv6 literal
 return u;
}
