import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { getDepopTokens } from "@/app/lib/depop-tokens-db";
import { depopFetch, depopApiBase } from "@/app/lib/depop";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ───────────────────────────────────────────────────────────────────────────
// Depop probe — the instrument that turns "we think this might work" into a fact.
//
// Everything blocking Depop right now is one unknown: we have never seen a completed, logged-in
// Depop response, so we don't know which endpoints answer, what a sold-items payload looks like, or
// whether a session captured on a phone is even accepted from our servers. Guessing at that in
// application code produces something that looks finished and silently returns nothing.
//
// So this asks Depop directly and reports exactly what came back. Three questions, in order:
//
//   1. reachable — can our servers talk to Depop AT ALL, with no credential? If this is blocked,
//      nothing else matters and the answer is "Cloudflare blocks our egress", not "bad session".
//   2. session   — does the stored credential come back as logged in? This is the one that tells us
//      whether server-side posting is viable, which is the whole architectural bet.
//   3. url       — anything the operator wants to try, with the session attached. This is how the
//      sold-items endpoint gets mapped: probe candidates until one answers, then set DEPOP_SOLD_PATH.
//
// The session value is NEVER returned. Bodies are truncated — enough to recognise a shape, not
// enough to dump someone's account into a log.
//
// Admin-only: it makes outbound requests on a seller's credential and returns raw upstream
// responses. That is a debugging tool, not a seller-facing feature.
// ───────────────────────────────────────────────────────────────────────────

const SNIPPET = 600;

async function look(url: string, init?: RequestInit) {
 const started = Date.now();
 const res = await fetch(url, { redirect: "follow", ...init }).catch(() => null);
 if (!res) return { url, ok: false, error: "request failed" };
 const body = await res.text().catch(() => "");
 return {
  url,
  status: res.status,
  ok: res.ok,
  ms: Date.now() - started,
  contentType: res.headers.get("content-type"),
  // The tell for a Cloudflare challenge rather than a real answer.
  cloudflare: /cf-mitigated|__cf_bm|cf-ray/i.test([...res.headers.keys()].join(",")) || /just a moment|attention required/i.test(body.slice(0, 2000)),
  snippet: body.slice(0, SNIPPET),
 };
}

export async function GET(request: NextRequest) {
 if (!isAdminRequest(request)) return NextResponse.json({ error: "Not found" }, { status: 404 });

 const slug = request.nextUrl.searchParams.get("store") || (await resolveStoreSlugAny(request));
 if (!slug) return NextResponse.json({ error: "Pass ?store=<slug>." }, { status: 400 });

 const tokens = await getDepopTokens(slug).catch(() => null);
 const custom = request.nextUrl.searchParams.get("url");

 const out: Record<string, unknown> = {
  store: slug,
  // What we hold, described but never revealed.
  credential: tokens
   ? {
      present: true,
      length: tokens.accessToken.length,
      shape: /^[\w-]+\.[\w-]+\.[\w-]+$/.test(tokens.accessToken.trim()) ? "jwt-like" : tokens.accessToken.includes("=") ? "cookie-like" : "opaque",
      handle: tokens.depopUser,
      expiresAt: tokens.expiresAt,
     }
   : { present: false },
  apiBase: await depopApiBase(slug).catch(() => null),
 };

 // 1. Can we reach Depop unauthenticated? Separates "they block our servers" from "bad session".
 out.reachable = await look("https://www.depop.com/", {
  headers: { "User-Agent": process.env.DEPOP_USER_AGENT || "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", Accept: "text/html" },
 });

 // 2. Does the stored session read as signed in? A logged-in Depop page mentions the seller's own
 //    handle; an anonymous one doesn't. Crude, and enough to answer yes/no.
 if (tokens) {
  const res = await depopFetch(slug, "https://www.depop.com/", { headers: { Accept: "text/html" } });
  const body = res ? await res.text().catch(() => "") : "";
  out.session = res
   ? {
      status: res.status,
      ok: res.ok,
      cloudflare: /just a moment|attention required/i.test(body.slice(0, 2000)),
      looksSignedIn: !!tokens.depopUser && body.includes(tokens.depopUser),
      mentionsLogIn: /log in|sign up/i.test(body.slice(0, 4000)),
      snippet: body.slice(0, SNIPPET),
     }
   : { error: "request failed" };
 }

 // 3. Whatever the operator wants to try, on the session. How DEPOP_SOLD_PATH gets discovered.
 if (custom) {
  const base = await depopApiBase(slug);
  const url = custom.startsWith("http") ? custom : `${base}${custom.startsWith("/") ? "" : "/"}${custom}`;
  const res = await depopFetch(slug, url);
  const body = res ? await res.text().catch(() => "") : "";
  out.custom = res ? { url, status: res.status, ok: res.ok, contentType: res.headers.get("content-type"), snippet: body.slice(0, SNIPPET * 3) } : { url, error: "request failed" };
 }

 return NextResponse.json(out);
}
