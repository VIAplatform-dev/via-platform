import { NextRequest } from "next/server";
import { storeSlugForHost } from "@/app/lib/plan-b/store-host";
import { getCaptureOrigin } from "@/app/lib/site-capture-db";
import { planCdnRequest } from "@/app/lib/plan-b/asset-proxy";
import { safeFetch } from "@/app/lib/safe-url";

// `/cdn/*` on a Plan B store origin — the theme's own assets, fetched from the site we captured.
//
// See app/lib/plan-b/asset-proxy.ts for WHY this route has to exist (short version: Shopify themes
// publish their import map with root-relative `/cdn/…` specifiers, which resolve against us).
//
// SECURITY. This is a fetch to a URL derived from a Host header, so:
//   • the host must be a real store origin (VYA's own hosts get nothing here),
//   • the upstream origin comes from OUR database, never from the request,
//   • safeFetch re-resolves DNS and rejects private IPs on every redirect hop (SSRF),
//   • vendor/checkout paths are answered inert rather than proxied (see planCdnRequest).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Theme assets are fingerprinted (`?v=<hash>`), so they are safe to cache hard. A response with no
// upstream Cache-Control still gets an hour rather than nothing, which is what keeps this route from
// becoming a per-asset origin fetch on every page view.
const FALLBACK_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

async function handle(req: NextRequest, method: "GET" | "HEAD"): Promise<Response> {
 const slug = storeSlugForHost(req.headers.get("host"));
 if (!slug) return new Response("Not found", { status: 404 });

 const origin = await getCaptureOrigin(slug).catch(() => null);
 const plan = planCdnRequest(req.nextUrl.pathname, req.nextUrl.search, origin);

 if (plan.action === "deny") return new Response("Not found", { status: 404 });
 if (plan.action === "inert") {
  return new Response(method === "HEAD" ? null : plan.body, {
   headers: { "Content-Type": plan.contentType, "Cache-Control": FALLBACK_CACHE },
  });
 }

 let upstream: Response;
 try {
  upstream = await safeFetch(plan.url, { method, headers: { "User-Agent": req.headers.get("user-agent") || "VYA" }, signal: AbortSignal.timeout(15000) });
 } catch {
  return new Response("Upstream unavailable", { status: 502 });
 }
 if (!upstream.ok) return new Response("Not found", { status: upstream.status === 404 ? 404 : 502 });

 const headers = new Headers();
 const ct = upstream.headers.get("content-type");
 if (ct) headers.set("Content-Type", ct);
 headers.set("Cache-Control", upstream.headers.get("cache-control") || FALLBACK_CACHE);
 // Deliberately NOT forwarding Content-Length or Content-Encoding. `fetch` decompresses the body
 // for us, so upstream's length describes the *compressed* bytes — copying it across truncates every
 // gzipped asset at that byte count, which fails as a silent syntax error partway through a theme
 // module rather than as an error anyone can see. Let the response be chunked instead.
 // Fonts loaded by the theme's CSS are cross-origin from the browser's point of view on the source
 // domain but same-origin here; keep the source's CORS header if it sent one.
 const acao = upstream.headers.get("access-control-allow-origin");
 if (acao) headers.set("Access-Control-Allow-Origin", acao);

 return new Response(method === "HEAD" ? null : upstream.body, { status: 200, headers });
}

export async function GET(req: NextRequest) { return handle(req, "GET"); }
export async function HEAD(req: NextRequest) { return handle(req, "HEAD"); }
