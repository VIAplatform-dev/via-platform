import { NextRequest, NextResponse } from "next/server";
import { resolveStoreSlugAny } from "@/app/lib/storeAuth";
import { saveDepopTokens } from "@/app/lib/depop-tokens-db";

export const dynamic = "force-dynamic";

// ───────────────────────────────────────────────────────────────────────────
// Depop connect — the email sign-in-link handshake.
//
// Depop stopped handing out Selling API access, so app/lib/depop.ts (written against the official
// partner API) has no way to obtain a token. This is the other route sellers already use with
// cross-listers: ask Depop to email a sign-in link, then hand that link to us.
//
// WE DO NOT YET KNOW WHAT THAT LINK CONTAINS. It may carry a ready-to-use token, a one-shot code
// that must be exchanged, or an opaque id that only means something to Depop's own client. So this
// route has two modes:
//
//   probe   — parse the link, report the SHAPE of what is in it, store nothing.
//   connect — same parse, and store the credential if the link plainly carried one.
//
// Probe exists so the first look costs nothing: it reports parameter names, value lengths and a
// 4-character prefix, which is enough to tell a JWT from a UUID and not enough to use. Nobody has
// to paste a live credential into a chat window to answer "what does this link actually contain".
//
// HANDLING RULES, because this is a credential:
//   · full values are never returned, never logged, never placed in an error message
//   · the raw link is not persisted
//   · a link that is not on depop.com is refused outright
// ───────────────────────────────────────────────────────────────────────────

/** Parameter names a sign-in link plausibly carries its credential under. */
const TOKEN_KEYS = ["token", "access_token", "accesstoken", "auth", "auth_token", "jwt", "id_token", "session", "sid", "key", "magic", "t"];
/** Names that mean "one-shot code you must exchange" rather than a directly usable token. */
const CODE_KEYS = ["code", "otp", "pin", "nonce", "challenge", "grant"];

type Found = { key: string; len: number; prefix: string; looksLike: string; where: "query" | "fragment" | "path" };

/** What KIND of value this is, judged on shape alone. Never returns the value itself. */
function classify(v: string): string {
 if (/^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(v)) return "JWT";
 if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return "UUID";
 if (/^[A-Za-z0-9_-]{20,}$/.test(v)) return "opaque token";
 if (/^\d{4,8}$/.test(v)) return "numeric code";
 return "short string";
}

/** Parse a link into a URL, tolerating a missing scheme. */
function toUrl(raw: string): URL | null {
 const t = raw.trim();
 try {
  return new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
 } catch {
  return null;
 }
}

/** Every candidate credential in a link — query string, #fragment, and path segments. */
function inspect(u: URL): Found[] {
 const found: Found[] = [];
 const consider = (key: string, value: string, where: Found["where"]) => {
  const k = key.toLowerCase();
  const v = (value || "").trim();
  if (!v || v.length < 6) return;
  // Keep anything under a known key, plus anything long enough to be a credential regardless.
  if (!TOKEN_KEYS.includes(k) && !CODE_KEYS.includes(k) && v.length < 20) return;
  found.push({ key, len: v.length, prefix: `${v.slice(0, 4)}…`, looksLike: classify(v), where });
 };
 u.searchParams.forEach((v, k) => consider(k, v, "query"));
 // Some providers put the credential after the # so it never reaches their own server logs.
 const frag = u.hash.replace(/^#/, "");
 if (frag) {
  if (frag.includes("=")) new URLSearchParams(frag).forEach((v, k) => consider(k, v, "fragment"));
  else consider("(fragment)", frag, "fragment");
 }
 // …and some put it in the path: /login/<token>
 for (const seg of u.pathname.split("/").filter(Boolean)) consider("(path segment)", seg, "path");
 return found;
}

/** Read one candidate's actual value back out. Called only at the point of storage. */
function valueFor(u: URL, f: Found): string {
 if (f.where === "query") return u.searchParams.get(f.key) || "";
 if (f.where === "fragment") {
  const frag = u.hash.replace(/^#/, "");
  return frag.includes("=") ? new URLSearchParams(frag).get(f.key) || "" : frag;
 }
 return u.pathname.split("/").filter(Boolean).find((s) => s.length === f.len) || "";
}

export async function POST(request: NextRequest) {
 const slug = await resolveStoreSlugAny(request);
 if (!slug) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

 const body = await request.json().catch(() => null);
 const link = typeof body?.link === "string" ? body.link : "";
 const mode = body?.mode === "connect" ? "connect" : body?.mode === "redeem" ? "redeem" : "probe";
 if (!link.trim()) return NextResponse.json({ error: "Paste the sign-in link from Depop’s email." }, { status: 400 });

 const u = toUrl(link);
 if (!u) return NextResponse.json({ ok: false, error: "That doesn’t look like a link — paste the whole URL from the email." }, { status: 400 });

 // A link pointing anywhere other than Depop is a mistake or a phishing attempt. Either way this
 // endpoint has no business pulling credentials out of it.
 if (!/(^|\.)depop\.com$/i.test(u.host)) {
  return NextResponse.json({ ok: false, host: u.host, error: `That link points at ${u.host} — expected a depop.com link.` }, { status: 400 });
 }

 // ── REDEEM ────────────────────────────────────────────────────────────────
 // The real Depop magic link carries its secret in the PATH (/login/magic-link/verify/<blob>/web),
 // not as a query token — so we don't extract anything, we replay the whole link the way clicking
 // it would, and watch what Depop does. A magic link is designed to hand a session to whoever holds
 // it, so a plain server-side GET often gets Set-Cookie'd straight back. We follow the redirect
 // chain by hand (so we can read cookies on each hop) and stop the moment either a session appears
 // or Depop bounces us to a check we won't fight.
 if (mode === "redeem") {
  const jar = new Map<string, string>();        // name → value, accumulated across hops
  const chain: { status: number; path: string; setCookies: string[] }[] = [];
  let next: string | null = u.toString();
  let wall: string | null = null;

  for (let hop = 0; hop < 6 && next; hop++) {
   const res: Response = await fetch(next, {
    method: "GET",
    redirect: "manual",
    headers: {
     // A normal browser identity so Depop returns its normal response. This endpoint isn't the
     // Turnstile-guarded login form; it's the magic-link redeem, whose auth factor is the secret
     // already in the URL. We are not solving or bypassing any challenge here.
     "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
     accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
     cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    },
   }).catch(() => null as unknown as Response);
   if (!res) { wall = "network error reaching Depop"; break; }

   const setCookies = (typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : []) as string[];
   for (const sc of setCookies) {
    const m = sc.match(/^([^=]+)=([^;]*)/);
    if (m && m[2] && m[2] !== "deleted" && m[2].length > 1) jar.set(m[1].trim(), m[2].trim());
   }
   const loc = res.headers.get("location");
   const hopPath = (() => { try { return new URL(next!).pathname; } catch { return next!; } })();
   chain.push({ status: res.status, path: hopPath, setCookies: setCookies.map((s) => s.split("=")[0]) });

   // Landed on a challenge/login page → that's the wall; stop rather than try to get around it.
   const landedPath = loc ? (() => { try { return new URL(loc, next!).pathname; } catch { return loc; } })() : hopPath;
   if (/\/login\/mfa|\/challenge|turnstile|captcha/i.test(landedPath)) { wall = landedPath; break; }

   if (loc) { next = new URL(loc, next).toString(); continue; }
   break; // no redirect → end of chain
  }

  // A session is present when the jar holds a cookie that reads like an auth/session credential.
  const authCookie = [...jar.keys()].find((n) => /token|session|sid|auth|access/i.test(n));
  const cookieHeader = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

  if (authCookie && !wall) {
   await saveDepopTokens(slug, {
    accessToken: cookieHeader,             // the whole cookie jar — what the poster will replay
    depopUser: typeof body?.handle === "string" ? body.handle.trim().replace(/^@/, "") : null,
   });
   return NextResponse.json({
    ok: true, mode, redeemed: true,
    cookieNames: [...jar.keys()],
    chain: chain.map((c) => ({ status: c.status, path: c.path, setCookies: c.setCookies })),
    note: "A session came back and was stored.",
   });
  }

  return NextResponse.json({
   ok: false, mode, redeemed: false,
   cookieNames: [...jar.keys()],
   chain: chain.map((c) => ({ status: c.status, path: c.path, setCookies: c.setCookies })),
   wall,
   note: wall
    ? `The redeem bounced to ${wall} — Depop wants a check the link alone doesn't satisfy. That's the wall; I won't try to get around it.`
    : "No session cookie came back. The redeem endpoint likely isn't the web link — send me this chain and I'll adjust.",
  });
 }

 const found = inspect(u);
 const token = found.find((f) => TOKEN_KEYS.includes(f.key.toLowerCase()) || f.looksLike === "JWT");
 const code = found.find((f) => CODE_KEYS.includes(f.key.toLowerCase()));

 if (mode === "probe") {
  return NextResponse.json({
   ok: true,
   mode,
   host: u.host,
   found, // key names, lengths and shapes only
   verdict: token
    ? "Carries what looks like a usable token."
    : code
    ? "Carries a one-shot code — needs an exchange step that isn’t built yet."
    : "No credential found in this link.",
  });
 }

 if (!token) {
  return NextResponse.json(
   {
    ok: false,
    host: u.host,
    found,
    error: code
     ? "That link carries a one-shot code rather than a token, so it needs an exchange step Depop hasn’t documented publicly."
     : "Couldn’t find a credential in that link.",
   },
   { status: 422 },
  );
 }

 const value = valueFor(u, token);
 if (!value) return NextResponse.json({ ok: false, error: "Found a credential but couldn’t read it back — run the probe and send me its output." }, { status: 422 });

 // A JWT states its own expiry, which tells us how often a seller will have to reconnect.
 let expiresInSec: number | null = null;
 if (token.looksLike === "JWT") {
  try {
   const payload = JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString());
   if (typeof payload?.exp === "number") expiresInSec = Math.max(60, payload.exp - Math.floor(Date.now() / 1000));
  } catch {
   /* doesn't decode — store it and find out empirically */
  }
 }

 await saveDepopTokens(slug, {
  accessToken: value,
  expiresInSec,
  depopUser: typeof body?.handle === "string" ? body.handle.trim().replace(/^@/, "") : null,
 });

 return NextResponse.json({ ok: true, mode, host: u.host, storedAs: token.key, looksLike: token.looksLike, expiresInSec });
}
