// Single source of truth for the site's absolute base URL.
//
// NEXT_PUBLIC_BASE_URL is sometimes configured without a scheme (e.g.
// "vyaplatform.com" instead of "https://vyaplatform.com"). A scheme-less value
// silently breaks anything that embeds it in an absolute context. Open Graph
// tags (Next resolves it against metadataBase and duplicates the domain) and
// email links (hrefs become relative and don't resolve). Normalize it once
// here so every caller gets a valid absolute URL with no trailing slash.
//
// Safe in both server and client code: NEXT_PUBLIC_ vars are inlined at build.
const raw = (process.env.NEXT_PUBLIC_BASE_URL || "https://vyaplatform.com").trim();
const withScheme = raw.startsWith("http") ? raw : `https://${raw}`;

export const BASE_URL = withScheme.replace(/\/+$/, "");

export function getBaseUrl(): string {
 return BASE_URL;
}
