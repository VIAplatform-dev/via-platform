// Printed QR codes. The codes themselves live in Neon (qr-codes-db.ts) so a card already in
// someone's hand can be repointed without a deploy; this file is the pure logic around them.
//
// Scanning getvya.ai/q/{code} records where it happened (qr-scans-db.ts) and forwards to the
// code's destination. Nothing here touches the database, which is what makes it all testable.

/**
 * Hosts a QR may send someone to. A printed code cannot be recalled, so the destination is
 * checked against this list on write AND on read: a bad row in qr_codes — a typo, a bad paste,
 * a compromised write — must never be able to turn our own printed card into an open redirect.
 */
const ALLOWED_HOSTS = new Set([
 "getvya.ai",
 "www.getvya.ai",
 "vyaplatform.com",
 "www.vyaplatform.com",
]);

/** Where a scan goes when its destination is missing, inactive, refused, or the DB is down. */
export const FALLBACK_DESTINATION = "https://getvya.ai/";

const OS_ORIGIN = "https://getvya.ai";

export function isAllowedDestination(url: string | null | undefined): boolean {
 if (!url) return false;
 let parsed: URL;
 try {
  parsed = new URL(url);
 } catch {
  return false; // not a URL, or protocol-relative like "//evil.com"
 }
 // https only: scans happen on phones on event wifi, and a downgraded hop buys us nothing.
 if (parsed.protocol !== "https:") return false;
 // Exact host match. A suffix check would accept "getvya.ai.evil.com".
 return ALLOWED_HOSTS.has(parsed.host.toLowerCase());
}

/**
 * Reduce a raw path segment to a plain slug. The code is whatever someone typed after /q/, so
 * it is untrusted: it reaches a query string and a DB row, and neither should ever see a path
 * traversal, a protocol, or 4KB of junk.
 */
export function normalizeQrCode(raw: string | null | undefined): string {
 return (raw || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9_-]/g, "")
  .slice(0, 40);
}

/** The URL to encode in the printed QR image. */
export function qrTargetUrl(raw: string): string {
 return `${OS_ORIGIN}/q/${normalizeQrCode(raw)}`;
}

/**
 * Where a scan forwards to. Tagged as utm so the visit lands in `utm_visits` alongside every
 * other marketing source, not only in the QR scan log. The destination's own query string is
 * preserved — a code may legitimately point at a filtered or sorted page.
 */
export function destinationFor(destination: string | null | undefined, rawCode: string): string {
 const url = new URL(isAllowedDestination(destination) ? destination! : FALLBACK_DESTINATION);
 url.searchParams.set("utm_source", "qr");
 url.searchParams.set("utm_medium", "print");
 url.searchParams.set("utm_campaign", normalizeQrCode(rawCode) || "unknown");
 return url.toString();
}

// Link previewers fetch a URL the moment it is pasted into a chat, and crawlers find anything
// that ends up on a public page. Counting those as scans would invent visits in cities nobody
// stood in — which is the whole point of the location data.
const BOT_UA =
 /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|embedly|preview|curl|wget|python-requests|node-fetch|axios|headless|lighthouse|monitor|scanner|feedfetcher/i;

export function isLikelyBotScan(userAgent: string | null | undefined): boolean {
 // A missing user-agent is unusual but not proof of a bot — count it rather than silently
 // drop a real scan.
 if (!userAgent) return false;
 return BOT_UA.test(userAgent);
}
