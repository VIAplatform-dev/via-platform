import { NextRequest, NextResponse } from "next/server";
import { tokenRequest, expiryFrom, espBaseUrl } from "@/app/lib/esp-oauth";
import { mailchimpMetadata, klaviyoAccountName, verify } from "@/app/lib/esp-client";
import { saveEspOauth } from "@/app/lib/esp-db";
import { authHeader } from "@/app/lib/esp-oauth";
import type { EspProvider } from "@/app/lib/esp-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE = espBaseUrl();
const back = (q: string) => NextResponse.redirect(new URL(`/admin/marketing/esp?${q}`, BASE));

// "Connect Mailchimp" — step two. They've approved; swap the code for a token and remember it.
//
// Every failure sends the seller back to the page with a reason rather than showing a raw error:
// they're standing in a shop, not reading a stack trace.
export async function GET(request: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
 const { provider: raw } = await ctx.params;
 const provider = (raw === "mailchimp" ? "mailchimp" : "klaviyo") as EspProvider;

 const url = new URL(request.url);
 const code = url.searchParams.get("code");
 const state = url.searchParams.get("state");
 // They send this when the seller presses Cancel. Not an error — just say nothing happened.
 if (url.searchParams.get("error")) return back("error=cancelled");
 if (!code) return back("error=nocode");

 const raw_cookie = request.cookies.get(`vya_esp_${provider}`)?.value;
 if (!raw_cookie) return back("error=expired");
 let saved: { slug: string; state: string; verifier: string };
 try { saved = JSON.parse(raw_cookie); } catch { return back("error=expired"); }
 // Without this check, a link someone else made could attach THEIR account to this store.
 if (!state || state !== saved.state) return back("error=state");

 const clientId = (provider === "mailchimp" ? process.env.MAILCHIMP_CLIENT_ID : process.env.KLAVIYO_CLIENT_ID) || "";
 const clientSecret = (provider === "mailchimp" ? process.env.MAILCHIMP_CLIENT_SECRET : process.env.KLAVIYO_CLIENT_SECRET) || "";
 if (!clientId || !clientSecret) return back("error=unavailable");

 let token: string, refresh: string | null = null, expiresAt: string | null = null;
 try {
  const req = tokenRequest({ provider, clientId, clientSecret, code, baseUrl: BASE, verifier: saved.verifier });
  const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body, signal: AbortSignal.timeout(20000) });
  if (!res.ok) return back("error=exchange");
  const d = await res.json();
  token = String(d?.access_token || "");
  if (!token) return back("error=exchange");
  refresh = d?.refresh_token ? String(d.refresh_token) : null;
  expiresAt = expiryFrom(d?.expires_in);
 } catch { return back("error=exchange"); }

 // Mailchimp: the account's datacentre is only available here, and every later call needs it.
 let serverPrefix: string | null = null;
 let accountName: string | null = null;
 if (provider === "mailchimp") {
  const meta = await mailchimpMetadata(token);
  if (!meta) return back("error=metadata");
  serverPrefix = meta.dc;
  accountName = meta.accountName;
 } else {
  accountName = await klaviyoAccountName(authHeader(provider, token));
 }

 // One list? Choose it now. Landing on a page that asks you to pick from a menu of one is a step
 // for nothing, and most shops have exactly one audience.
 const host = serverPrefix ? `https://${serverPrefix}.api.mailchimp.com/3.0` : null;
 const v = await verify(provider, { headers: authHeader(provider, token), host });
 const only = v.ok && v.lists.length === 1 ? v.lists[0] : null;

 await saveEspOauth(saved.slug, {
  provider, accessToken: token, refreshToken: refresh, expiresAt, serverPrefix,
  accountName, listId: only?.id ?? null, listName: only?.name ?? null,
 });

 const res = back("connected=1");
 res.cookies.delete(`vya_esp_${provider}`);
 return res;
}
